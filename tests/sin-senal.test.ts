import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { leerCarrito, registrarVenta } from "../src/lib/ventas";
import { guardarDocumento } from "../src/lib/documentos";

/**
 * Ventas y documentos hechos sin señal.
 *
 * Se guardan en el telefono con una llave y se suben cuando vuelve la señal.
 * Con mala señal la subida se corta y se reintenta, o sale dos veces a la vez:
 * lo que se fija aqui es que nada quede repetido, que el inventario no se
 * descuente dos veces y que la llave de una cuenta no sirva en otra.
 */
const db = new PrismaClient();
const S = "senal-" + Date.now();
type Sesion = Parameters<typeof registrarVenta>[0];

let tienda: Sesion;
let otra: Sesion;
let camisaId: string;
let tallaId: string;

async function crear(nombre: string): Promise<Sesion> {
  const u = await db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: nombre,
      businessName: nombre + " " + S,
      businessType: "ROPA",
      slug: nombre + "-" + S,
      staff: { create: { name: nombre, role: "DUENO" } },
    },
    include: { staff: true },
  });
  const { staff, ...user } = u;
  return { user, staff: staff[0] };
}

beforeAll(async () => {
  tienda = await crear("tienda");
  otra = await crear("otra");
  const camisa = await db.service.create({
    data: { userId: tienda.user.id, name: "Camisa", price: 50000, trackStock: true },
  });
  camisaId = camisa.id;
  const talla = await db.productVariant.create({
    data: { userId: tienda.user.id, serviceId: camisa.id, size: "M", color: "Negro", stock: 3 },
  });
  tallaId = talla.id;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

const PDF = "data:application/pdf;base64," + Buffer.from("%PDF-1.4\n%prueba").toString("base64");

describe("ventas hechas sin señal", () => {
  const venta = () => ({
    clientKey: "venta-" + S,
    day: "2026-09-10",
    items: [{ serviceId: camisaId, variantId: tallaId, name: "Camisa - M / Negro", unitPrice: 50000, qty: 2 }],
    paymentMethod: "TARJETA",
  });

  it("subida dos veces queda una sola y descuenta el inventario una vez", async () => {
    const a = await registrarVenta(tienda, venta());
    const b = await registrarVenta(tienda, venta());
    if (!a.ok || !b.ok) throw new Error("debia registrarse");
    expect(a.datos.repetido).toBe(false);
    expect(b.datos).toEqual({ id: a.datos.id, repetido: true, tipo: "venta", receiptSeq: a.datos.receiptSeq });

    expect(await db.sale.count({ where: { userId: tienda.user.id } })).toBe(1);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: tallaId } })).stock).toBe(1);
    const guardada = await db.sale.findUniqueOrThrow({ where: { id: a.datos.id }, include: { items: true } });
    expect(guardada.total).toBe(100000);
    // Conserva el dia en que se hizo, aunque suba despues.
    expect(guardada.day).toBe("2026-09-10");
    expect(guardada.paymentMethod).toBe("TARJETA");
    expect(guardada.staffId).toBe(tienda.staff.id);
    expect(guardada.items[0].variantLabel).toBeTruthy();
  });

  it("dos subidas a la vez de la misma venta no la duplican", async () => {
    const llave = "carrera-" + S;
    const [a, b] = await Promise.all([
      registrarVenta(tienda, { clientKey: llave, manualTotal: "7000" }),
      registrarVenta(tienda, { clientKey: llave, manualTotal: "7000" }),
    ]);
    if (!a.ok || !b.ok) throw new Error("debian responder bien las dos");
    expect(a.datos.id).toBe(b.datos.id);
    expect(await db.sale.count({ where: { clientKey: llave } })).toBe(1);
  });

  it("otra cuenta no puede usar la llave de una venta ajena", async () => {
    const r = await registrarVenta(otra, venta());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
    expect(await db.sale.count({ where: { userId: otra.user.id } })).toBe(0);
  });

  it("si al subir ya no alcanza el inventario, la rechaza sin guardar nada", async () => {
    const r = await registrarVenta(tienda, {
      clientKey: "sin-stock-" + S,
      items: [{ serviceId: camisaId, variantId: tallaId, name: "Camisa - M / Negro", unitPrice: 50000, qty: 5 }],
    });
    expect(r.ok).toBe(false);
    // 400: el telefono no la reintenta sola, la muestra con el motivo.
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error).toMatch(/No alcanza el stock/);
    }
    expect(await db.sale.count({ where: { clientKey: "sin-stock-" + S } })).toBe(0);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: tallaId } })).stock).toBe(1);
  });

  it("un valor suelto queda con su concepto", async () => {
    const r = await registrarVenta(tienda, { clientKey: "suelta-" + S, manualTotal: "12500", concept: "Arreglo de basta" });
    if (!r.ok) throw new Error(r.error);
    const v = await db.sale.findUniqueOrThrow({ where: { id: r.datos.id }, include: { items: true } });
    expect(v.total).toBe(12500);
    expect(v.items.map((i) => i.name)).toEqual(["Arreglo de basta"]);
  });

  it("rechaza una venta vacía y una llave rara", async () => {
    expect((await registrarVenta(tienda, { clientKey: "vacia-" + S })).ok).toBe(false);
    const rara = await registrarVenta(tienda, { clientKey: "x", manualTotal: "1000" });
    expect(rara.ok).toBe(false);
    if (!rara.ok) expect(rara.error).toBe("Llave inválida.");
  });

  it("lee el carrito como lista o como texto, y descarta lo que no sirve", () => {
    const fila = { serviceId: "a", variantId: "", name: " Corte ", unitPrice: 20000.4, qty: 0 };
    expect(leerCarrito([fila])).toEqual([{ serviceId: "a", variantId: null, name: "Corte", unitPrice: 20000, qty: 1 }]);
    expect(leerCarrito(JSON.stringify([fila]))).toHaveLength(1);
    expect(leerCarrito("no es json")).toEqual([]);
    expect(leerCarrito([{ name: "" }, null])).toEqual([]);
  });
});

describe("documentos escaneados sin señal", () => {
  it("subido dos veces queda uno, y otra cuenta no usa la llave", async () => {
    const doc = { clientKey: "doc-" + S, title: "Acta", pdf: PDF, pages: 1, text: "ACTA" };
    const a = await guardarDocumento(tienda, doc);
    const b = await guardarDocumento(tienda, doc);
    if (!a.ok || !b.ok) throw new Error("debia guardarse");
    expect(b.datos).toEqual({ id: a.datos.id, repetido: true });
    expect(await db.scanDocument.count({ where: { userId: tienda.user.id } })).toBe(1);

    const ajena = await guardarDocumento(otra, doc);
    expect(ajena.ok).toBe(false);
    if (!ajena.ok) expect(ajena.status).toBe(409);
  });
});
