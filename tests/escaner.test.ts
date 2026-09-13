import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import { aplicarModo, nombreDocumento } from "../src/lib/escaner";
import { borrarDocumento, guardarDocumento } from "../src/lib/documentos";

/**
 * El escaner de documentos.
 *
 * Lo que se fija: que el modo documento deje el papel blanco y la tinta negra
 * aunque la foto tenga sombra o luz amarilla, sin inventar manchas en una hoja
 * en blanco; y que solo se guarde un PDF de verdad, visible para quien toca.
 */

/** Una "foto" de pixeles: fondo papel amarillento y un bloque de tinta. */
function foto(n: number, papel: [number, number, number], tinta: [number, number, number], conTinta = 0.1) {
  const px = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const c = i < n * conTinta ? tinta : papel;
    px.set([c[0], c[1], c[2], 255], i * 4);
  }
  return px;
}

describe("modo documento", () => {
  it("deja el papel blanco y la tinta negra", () => {
    const px = foto(1000, [205, 190, 150], [70, 60, 50]);
    aplicarModo(px, "documento");
    expect([px[0], px[1], px[2]]).toEqual([0, 0, 0]);
    const ultimo = (1000 - 1) * 4;
    expect([px[ultimo], px[ultimo + 1], px[ultimo + 2]]).toEqual([255, 255, 255]);
  });

  it("una hoja en blanco no se llena de manchas", () => {
    const px = foto(1000, [228, 226, 220], [226, 224, 218], 0.5);
    aplicarModo(px, "documento");
    for (let i = 0; i < 1000; i++) expect(px[i * 4]).toBe(255);
  });

  it("gris quita el color sin estirar, y color no toca nada", () => {
    const gris = foto(10, [255, 0, 0], [0, 0, 255]);
    aplicarModo(gris, "gris");
    expect(gris[0]).toBe(gris[1]);
    expect(gris[1]).toBe(gris[2]);

    const color = foto(10, [255, 0, 0], [0, 0, 255]);
    aplicarModo(color, "color");
    expect([color[36], color[37], color[38]]).toEqual([255, 0, 0]);
  });

  it("arma nombres de archivo limpios", () => {
    expect(nombreDocumento("Factura Nº 12 — Julio", "pdf")).toBe("factura-n-12-julio.pdf");
    expect(nombreDocumento("   ", "txt")).toBe("documento.txt");
  });
});

describe("documentos guardados", () => {
  const db = new PrismaClient();
  const S = "esc-" + Date.now();
  let cuenta: Awaited<ReturnType<typeof crear>>;
  let pdf: string;

  function crear() {
    return db.user.create({
      data: {
        email: "esc-" + S + "@test.local",
        passwordHash: "x",
        ownerName: "Admin",
        businessName: "Escaner " + S,
        businessType: "OTRO",
        slug: "esc-" + S,
        staff: { create: [{ name: "Admin", role: "DUENO" }, { name: "Juan", role: "VENDEDOR" }, { name: "Rosa", role: "VENDEDOR" }] },
      },
      include: { staff: true },
    });
  }
  const sesion = (nombre: string) => ({ user: cuenta, staff: cuenta.staff.find((s) => s.name === nombre)! });

  beforeAll(async () => {
    cuenta = await crear();
    const doc = await PDFDocument.create();
    doc.addPage();
    pdf = "data:application/pdf;base64," + Buffer.from(await doc.save()).toString("base64");
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: cuenta.id } });
    await db.$disconnect();
  });

  it("guarda un PDF de verdad con su texto", async () => {
    const r = await guardarDocumento(sesion("Juan"), { title: "Cédula", pdf, pages: 1, text: "REPUBLICA DE COLOMBIA" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const doc = await db.scanDocument.findUniqueOrThrow({ where: { id: r.datos.id } });
    expect(doc.text).toBe("REPUBLICA DE COLOMBIA");
    expect(doc.staffId).toBe(sesion("Juan").staff.id);
  });

  it("rechaza lo que no es PDF y un numero de paginas raro", async () => {
    const falso = "data:application/pdf;base64," + Buffer.from("<html>").toString("base64");
    expect((await guardarDocumento(sesion("Juan"), { title: "x", pdf: falso, pages: 1 })).ok).toBe(false);
    expect((await guardarDocumento(sesion("Juan"), { title: "x", pdf, pages: 0 })).ok).toBe(false);
    expect((await guardarDocumento(sesion("Juan"), { title: "x", pdf, pages: 500 })).ok).toBe(false);
  });

  it("un empleado no borra lo de otro; el administrador si", async () => {
    const r = await guardarDocumento(sesion("Juan"), { title: "De Juan", pdf, pages: 1 });
    if (!r.ok) throw new Error(r.error);
    expect(await borrarDocumento(sesion("Rosa"), r.datos.id)).toBe(false);
    expect(await db.scanDocument.count({ where: { id: r.datos.id } })).toBe(1);
    expect(await borrarDocumento(sesion("Admin"), r.datos.id)).toBe(true);
    expect(await db.scanDocument.count({ where: { id: r.datos.id } })).toBe(0);
  });
});
