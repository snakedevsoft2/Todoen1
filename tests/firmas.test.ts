import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PDFDocument, degrees } from "pdf-lib";
import { normalizarSpots, leerSpots } from "../src/lib/firma-spots";
import { aPdf, firmarPdf, textoPdf } from "../src/lib/firma-pdf";
import {
  MAX_DOCS_FIRMA,
  agregarDocumento,
  anularSolicitud,
  crearSolicitud,
  firmarSolicitud,
  guardarLugares,
  solicitudPorToken,
} from "../src/lib/firmas";

/**
 * Firma de documentos.
 *
 * Lo que se fija: que la firma caiga donde el cliente la puso aunque la
 * pagina venga girada, que el enlace sirva una sola vez para firmar, que no se
 * pueda firmar sin aceptar ni sin firma, y que nadie toque las solicitudes de
 * otro negocio ni las de otro empleado.
 */
const db = new PrismaClient();
const S = "firm-" + Date.now();
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const aDataUrl = (bytes: Uint8Array) => "data:application/pdf;base64," + Buffer.from(bytes).toString("base64");
const origen = { ip: "1.2.3.4", navegador: "prueba" };

let pdf: string;
let cuenta: Awaited<ReturnType<typeof crear>>;
let otra: Awaited<ReturnType<typeof crear>>;

async function crear(sufijo: string) {
  return db.user.create({
    data: {
      email: "firm-" + sufijo + S + "@test.local",
      passwordHash: "x",
      ownerName: "Admin",
      businessName: "Firmas " + sufijo,
      businessType: "ASISTENCIA",
      slug: "firm-" + sufijo + S,
      staff: {
        create: [
          { name: "Admin", role: "DUENO" },
          { name: "Juan", role: "VENDEDOR" },
          { name: "Rosa", role: "VENDEDOR" },
        ],
      },
    },
    include: { staff: true },
  });
}

const sesion = (c: typeof cuenta, nombre: string) => ({ user: c, staff: c.staff.find((s) => s.name === nombre)! });

beforeAll(async () => {
  cuenta = await crear("a");
  otra = await crear("b");
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  doc.addPage([612, 792]);
  pdf = aDataUrl(await doc.save());
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [cuenta.id, otra.id] } } });
  await db.$disconnect();
});

describe("lugares de la firma", () => {
  it("deja las cajas dentro de la pagina y bota lo que no sirve", () => {
    const s = normalizarSpots(
      [
        { page: 1, x: 0.9, y: -1, w: 0.3, h: 0.1 },
        { page: 9, x: 0, y: 0, w: 0.1, h: 0.1 },
        { page: 1, x: "a", y: 0, w: 0.1, h: 0.1 },
        null,
      ],
      2
    );
    expect(s).toEqual([{ page: 1, x: 0.7, y: 0, w: 0.3, h: 0.1 }]);
    expect(leerSpots("{no es json", 2)).toEqual([]);
  });

  it("convierte el punto de pantalla al del PDF segun el giro de la pagina", async () => {
    const doc = await PDFDocument.create();
    const recta = doc.addPage([600, 800]);
    const girada = doc.addPage([600, 800]);
    girada.setRotation(degrees(90));

    const a = aPdf(recta);
    expect([a.ancho, a.alto]).toEqual([600, 800]);
    // Arriba a la izquierda en pantalla es arriba a la izquierda del PDF.
    expect(a.punto(0, 0)).toEqual({ x: 0, y: 800 });

    const b = aPdf(girada);
    // Girada 90: en pantalla se ve acostada, 800 de ancho y 600 de alto.
    expect([b.ancho, b.alto]).toEqual([800, 600]);
    expect(b.punto(0, 0)).toEqual({ x: 0, y: 0 });
    expect(b.punto(800, 600)).toEqual({ x: 600, y: 800 });
  });

  it("arma el PDF firmado con la hoja de constancia al final", async () => {
    const original = Buffer.from(pdf.slice(pdf.indexOf(",") + 1), "base64");
    const firmado = await firmarPdf(new Uint8Array(original), Buffer.from(PNG.split(",")[1], "base64"), [{ page: 2, x: 0.6, y: 0.8, w: 0.3, h: 0.1 }], {
      negocio: "Negocio ñandú",
      solicitud: "Acta",
      documento: "acta",
      firmante: "José Pérez 😀",
      identificacion: "123",
      contacto: null,
      fecha: "1 de octubre de 2026",
      ip: "1.2.3.4",
      navegador: "x".repeat(400),
      huellaOriginal: "a".repeat(64),
      referencia: "r",
    });
    const leido = await PDFDocument.load(firmado);
    expect(leido.getPageCount()).toBe(3);
    expect(textoPdf("José 😀")).toBe("José ??");
  });
});

describe("solicitudes de firma", () => {
  it("se firma una sola vez, con firma y aceptando", async () => {
    const juan = sesion(cuenta, "Juan");
    const r = await crearSolicitud(juan, { title: "Acta de entrega", signerName: "Cliente Uno", signerEmail: "malo" });
    expect(r.ok).toBe(false);

    const ok = await crearSolicitud(juan, { title: "Acta de entrega", signerName: "Cliente Uno" });
    if (!ok.ok) throw new Error(ok.error);
    const id = ok.datos.id;

    const d = await agregarDocumento(juan, id, { name: "acta.pdf", data: pdf });
    if (!d.ok) throw new Error(d.error);
    expect((await db.signDocument.findUniqueOrThrow({ where: { id: d.datos.id } })).name).toBe("acta");

    const lugares = await guardarLugares(juan, d.datos.id, [{ page: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }]);
    expect(lugares.ok).toBe(true);

    const { token } = await db.signRequest.findUniqueOrThrow({ where: { id } });
    expect(token.length).toBeGreaterThanOrEqual(30);

    expect((await firmarSolicitud(token, { name: "Cliente Uno", signature: PNG }, origen)).ok).toBe(false);
    expect((await firmarSolicitud(token, { name: "Cliente Uno", accept: true }, origen)).ok).toBe(false);
    expect((await firmarSolicitud(token, { name: "Cliente Uno", accept: true, signature: "data:image/png;base64,PGh0bWw+" }, origen)).ok).toBe(false);

    const firma = await firmarSolicitud(token, { name: "Cliente Uno", docNumber: "123", accept: true, signature: PNG }, origen);
    expect(firma.ok).toBe(true);

    const guardada = await solicitudPorToken(token);
    expect(guardada?.status).toBe("FIRMADO");
    const doc = await db.signDocument.findUniqueOrThrow({ where: { id: d.datos.id } });
    expect(doc.signedPdf).toBeTruthy();
    expect((await PDFDocument.load(Buffer.from(doc.signedPdf!.split(",")[1], "base64"))).getPageCount()).toBe(3);

    const otraVez = await firmarSolicitud(token, { name: "Otro", accept: true, signature: PNG }, origen);
    expect(otraVez.ok || otraVez.status).toBe(409);
    // Ya firmada no recibe mas documentos.
    expect((await agregarDocumento(juan, id, { name: "otro", data: pdf })).ok).toBe(false);
  });

  it("una cancelada no se puede firmar", async () => {
    const admin = sesion(cuenta, "Admin");
    const r = await crearSolicitud(admin, { signerName: "Cliente Dos" });
    if (!r.ok) throw new Error(r.error);
    await agregarDocumento(admin, r.datos.id, { name: "x", data: pdf });
    expect(await anularSolicitud(admin, r.datos.id)).toBe(true);
    const { token } = await db.signRequest.findUniqueOrThrow({ where: { id: r.datos.id } });
    const f = await firmarSolicitud(token, { name: "Cliente Dos", accept: true, signature: PNG }, origen);
    expect(f.ok || f.status).toBe(410);
  });

  it("nadie toca lo de otro negocio ni lo de otro empleado", async () => {
    const juan = sesion(cuenta, "Juan");
    const r = await crearSolicitud(juan, { signerName: "Cliente Tres" });
    if (!r.ok) throw new Error(r.error);
    const d = await agregarDocumento(juan, r.datos.id, { name: "x", data: pdf });
    if (!d.ok) throw new Error(d.error);

    // Otro negocio.
    expect((await agregarDocumento(sesion(otra, "Admin"), r.datos.id, { name: "x", data: pdf })).ok).toBe(false);
    expect((await guardarLugares(sesion(otra, "Admin"), d.datos.id, [])).ok).toBe(false);
    expect(await anularSolicitud(sesion(otra, "Admin"), r.datos.id)).toBe(false);
    // Otro empleado del mismo negocio.
    expect((await agregarDocumento(sesion(cuenta, "Rosa"), r.datos.id, { name: "x", data: pdf })).ok).toBe(false);
    // El dueno si.
    expect((await agregarDocumento(sesion(cuenta, "Admin"), r.datos.id, { name: "y", data: pdf })).ok).toBe(true);

    // Un escaneo de otro negocio no se puede adjuntar.
    const scan = await db.scanDocument.create({
      data: { userId: otra.id, staffId: null, title: "ajeno", pdf, size: 100, pages: 2 },
    });
    expect((await agregarDocumento(juan, r.datos.id, { scanId: scan.id })).ok).toBe(false);
  });

  it("rechaza lo que no es PDF ni foto y respeta el maximo de documentos", async () => {
    const admin = sesion(cuenta, "Admin");
    const r = await crearSolicitud(admin, { signerName: "Cliente Cuatro" });
    if (!r.ok) throw new Error(r.error);
    expect((await agregarDocumento(admin, r.datos.id, { name: "x", data: "data:application/pdf;base64,PGh0bWw+" })).ok).toBe(false);
    expect((await agregarDocumento(admin, r.datos.id, { name: "x", data: "data:text/html;base64,PGh0bWw+" })).ok).toBe(false);
    expect((await agregarDocumento(admin, r.datos.id, { name: "foto", data: PNG })).ok).toBe(true);
    for (let i = 1; i < MAX_DOCS_FIRMA; i++) await agregarDocumento(admin, r.datos.id, { name: "d" + i, data: pdf });
    expect((await agregarDocumento(admin, r.datos.id, { name: "uno mas", data: pdf })).ok).toBe(false);
  });
});
