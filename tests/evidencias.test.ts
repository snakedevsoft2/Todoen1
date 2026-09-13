import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import { agregarAdjunto, borrarAdjunto, crearInforme, esPdfDeVerdad, MAX_ADJUNTOS } from "../src/lib/informes";

/**
 * Evidencias en PDF de los reportes.
 *
 * Lo que se fija: que solo entre un PDF de verdad (no un archivo con la
 * etiqueta cambiada, porque despues se sirve y se pega en el reporte), que el
 * reintento de la cola no lo duplique, los topes, y que un empleado no toque
 * lo de otro.
 */
const db = new PrismaClient();
const S = "evid-" + Date.now();
const aDataUrl = (bytes: Uint8Array | Buffer, tipo = "application/pdf") =>
  "data:" + tipo + ";base64," + Buffer.from(bytes).toString("base64");

let pdf: string;
let cuenta: Awaited<ReturnType<typeof crear>>;

async function crear() {
  return db.user.create({
    data: {
      email: "evid-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Admin",
      businessName: "Evidencias " + S,
      businessType: "ASISTENCIA",
      slug: "evid-" + S,
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

const sesion = (nombre: string) => ({ user: cuenta, staff: cuenta.staff.find((s) => s.name === nombre)! });

beforeAll(async () => {
  cuenta = await crear();
  const doc = await PDFDocument.create();
  doc.addPage();
  pdf = aDataUrl(await doc.save());
});

afterAll(async () => {
  await db.user.delete({ where: { id: cuenta.id } });
  await db.$disconnect();
});

describe("evidencias en PDF", () => {
  it("reconoce un PDF de verdad", () => {
    expect(esPdfDeVerdad(pdf)).toBe(true);
    expect(esPdfDeVerdad(aDataUrl(Buffer.from("<html><script>alert(1)</script>")))).toBe(false);
    expect(esPdfDeVerdad("sin coma")).toBe(false);
  });

  it("se pega al reporte una sola vez aunque la cola reintente", async () => {
    const juan = sesion("Juan");
    const r = await crearInforme(juan, { clientKey: "rep-" + S, title: "Con acta" });
    if (!r.ok) throw new Error(r.error);

    const uno = await agregarAdjunto(juan, r.datos.id, { clientKey: "rep-" + S + ":a0", name: "acta", data: pdf });
    const dos = await agregarAdjunto(juan, r.datos.id, { clientKey: "rep-" + S + ":a0", name: "acta", data: pdf });
    expect(uno.ok && dos.ok && dos.datos.repetido).toBe(true);
    const guardados = await db.visitAttachment.findMany({ where: { reportId: r.datos.id } });
    expect(guardados).toHaveLength(1);
    // Le pone la extension si no la trae.
    expect(guardados[0].name).toBe("acta.pdf");
  });

  it("rechaza lo que no es PDF, lo muy pesado y lo que pasa del maximo", async () => {
    const juan = sesion("Juan");
    const r = await crearInforme(juan, { clientKey: "topes-" + S, title: "Topes" });
    if (!r.ok) throw new Error(r.error);

    expect((await agregarAdjunto(juan, r.datos.id, { name: "falso.pdf", data: aDataUrl(Buffer.from("<html>hola</html>")) })).ok).toBe(false);
    expect((await agregarAdjunto(juan, r.datos.id, { name: "foto.pdf", data: aDataUrl(Buffer.from("%PDF"), "image/png") })).ok).toBe(false);

    const gigante = aDataUrl(Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(3 * 1024 * 1024 + 10, 32)]));
    const pesado = await agregarAdjunto(juan, r.datos.id, { name: "gigante.pdf", data: gigante });
    expect(pesado.ok).toBe(false);

    for (let i = 0; i < MAX_ADJUNTOS; i++) {
      const ok = await agregarAdjunto(juan, r.datos.id, { name: "doc" + i + ".pdf", data: pdf });
      expect(ok.ok).toBe(true);
    }
    const sobra = await agregarAdjunto(juan, r.datos.id, { name: "sobra.pdf", data: pdf });
    expect(sobra.ok).toBe(false);
  });

  it("un empleado no pega ni quita evidencias en el reporte de otro", async () => {
    const juan = sesion("Juan");
    const rosa = sesion("Rosa");
    const r = await crearInforme(juan, { clientKey: "ajeno-" + S, title: "De Juan" });
    if (!r.ok) throw new Error(r.error);
    const propio = await agregarAdjunto(juan, r.datos.id, { name: "mio.pdf", data: pdf });
    if (!propio.ok) throw new Error(propio.error);

    const intento = await agregarAdjunto(rosa, r.datos.id, { name: "intruso.pdf", data: pdf });
    expect(intento.ok).toBe(false);
    expect(await borrarAdjunto(rosa, propio.datos.id)).toBeNull();
    expect(await db.visitAttachment.count({ where: { id: propio.datos.id } })).toBe(1);

    // El administrador si puede.
    expect(await borrarAdjunto(sesion("Admin"), propio.datos.id)).toBe(r.datos.id);
    expect(await db.visitAttachment.count({ where: { id: propio.datos.id } })).toBe(0);
  });
});
