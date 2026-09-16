import { afterAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { configurarMesas, marcarPedidoVisto, mesasDelNegocio, ordenDeMesa, pedirEnMesa } from "../src/lib/mesas";

/**
 * Las mesas del restaurante, con su QR para pedir.
 *
 * Lo que se fija: que configurar el numero de mesas cree, reactive y apague
 * sin borrar nunca (los tokens de QR no pueden cambiar), que pedir por QR
 * junte cantidades del mismo producto y marque "pedido nuevo", que tocar una
 * mesa nunca duplique su cuenta, y que una mesa de otro negocio (o inventada)
 * no sirva para nada.
 */
const S = "mesas-" + Date.now();

async function negocio(nombre: string) {
  return db.user.create({
    data: {
      passwordHash: "x",
      ownerName: "Dueño",
      businessType: "RESTAURANTE",
      email: nombre + "-" + S + "@test.local",
      businessName: nombre + " " + S,
      slug: nombre + "-" + S,
      services: {
        create: [
          { name: "Almuerzo", price: 15000, category: "Platos" },
          { name: "Jugo", price: 5000, category: "Bebidas" },
        ],
      },
    },
    include: { services: true },
  });
}

const cuenta = await negocio("rest");
const otro = await negocio("otro");

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [cuenta.id, otro.id] } } });
});

describe("configurar cuántas mesas hay", () => {
  it("crea las mesas numeradas desde 1, con su propio token de QR", async () => {
    const r = await configurarMesas(cuenta.id, 3);
    expect(r).toEqual({ ok: "Ahora tienes 3 mesas." });
    const mesas = await mesasDelNegocio(cuenta.id);
    expect(mesas.map((m) => m.number)).toEqual([1, 2, 3]);
    expect(new Set(mesas.map((m) => m.qrToken)).size).toBe(3);
  });

  it("al bajar la cantidad apaga las de número más alto, sin borrarlas", async () => {
    const antes = await mesasDelNegocio(cuenta.id);
    const tokenMesa1 = antes.find((m) => m.number === 1)!.qrToken;

    const r = await configurarMesas(cuenta.id, 1);
    expect(r).toEqual({ ok: "Ahora tienes 1 mesa." });
    const activas = await mesasDelNegocio(cuenta.id);
    expect(activas.map((m) => m.number)).toEqual([1]);
    expect(activas[0].qrToken).toBe(tokenMesa1);

    const todas = await db.table.findMany({ where: { userId: cuenta.id } });
    expect(todas).toHaveLength(3);
    expect(todas.some((m) => m.number === 3 && !m.active)).toBe(true);
  });

  it("al volver a subir, reactiva las que ya existían antes de crear nuevas", async () => {
    await configurarMesas(cuenta.id, 3);
    const mesas = await mesasDelNegocio(cuenta.id);
    expect(mesas.map((m) => m.number)).toEqual([1, 2, 3]);
    // La 2 y la 3 vuelven con el mismo id (y el mismo QR) que antes de apagarlas.
    const original = await db.table.findFirst({ where: { userId: cuenta.id, number: 3 } });
    expect(original?.active).toBe(true);

    const grande = await configurarMesas(cuenta.id, 65);
    expect(grande).toEqual({ error: "Como mucho 60 mesas." });
    expect(await configurarMesas(cuenta.id, -1)).toEqual({ error: "Escribe cuántas mesas tienes." });
  });
});

describe("pedir desde el QR de la mesa", () => {
  it("abre la cuenta, y un segundo pedido se suma a la misma sin duplicar", async () => {
    await configurarMesas(otro.id, 2);
    const [mesa1] = await mesasDelNegocio(otro.id);
    const [almuerzo, jugo] = otro.services;

    const primero = await pedirEnMesa(mesa1.qrToken, [{ serviceId: almuerzo.id, qty: 1 }], "sin cebolla");
    expect(primero).toMatchObject({ ok: "Pedido enviado." });
    const orderId = (primero as { orderId: string }).orderId;

    const segundo = await pedirEnMesa(mesa1.qrToken, [{ serviceId: almuerzo.id, qty: 2 }, { serviceId: jugo.id, qty: 1 }], null);
    expect((segundo as { orderId: string }).orderId).toBe(orderId);

    const orden = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
    expect(orden?.hasNewFromCustomer).toBe(true);
    expect(orden?.notes).toBe("sin cebolla");
    expect(orden?.items.find((i) => i.serviceId === almuerzo.id)?.qty).toBe(3);
    expect(orden?.items.find((i) => i.serviceId === jugo.id)?.qty).toBe(1);
  });

  it("marcarPedidoVisto apaga el aviso, y solo del negocio dueño de la cuenta", async () => {
    const [mesa1] = await mesasDelNegocio(otro.id);
    const orden = await db.order.findFirst({ where: { tableId: mesa1.id } });
    await marcarPedidoVisto(cuenta.id, orden!.id); // otro negocio: no le hace nada
    expect((await db.order.findUnique({ where: { id: orden!.id } }))?.hasNewFromCustomer).toBe(true);
    await marcarPedidoVisto(otro.id, orden!.id);
    expect((await db.order.findUnique({ where: { id: orden!.id } }))?.hasNewFromCustomer).toBe(false);
  });

  it("una mesa que no existe, o de otro negocio, no deja pedir", async () => {
    const [mesaAjena] = await mesasDelNegocio(cuenta.id);
    expect(await pedirEnMesa("token-inventado", [{ serviceId: "x", qty: 1 }], null)).toEqual({
      error: "Esa mesa ya no existe. Avísale a alguien del negocio.",
    });
    // El token es real, pero el producto es de OTRO negocio: no debe colarse.
    const productoAjeno = otro.services[0].id;
    const r = await pedirEnMesa(mesaAjena.qrToken, [{ serviceId: productoAjeno, qty: 1 }], null);
    expect(r).toEqual({ error: "Esos productos ya no están disponibles." });
  });
});

describe("tocar una mesa desde el piso del panel", () => {
  it("libre: le abre una cuenta; con cuenta abierta: entra a la misma sin duplicar", async () => {
    await configurarMesas(cuenta.id, 2);
    const [, mesa2] = await mesasDelNegocio(cuenta.id);

    const primera = await ordenDeMesa(cuenta.id, mesa2.id);
    expect(primera).toMatchObject({ creada: true, label: "Mesa " + mesa2.number });

    const segunda = await ordenDeMesa(cuenta.id, mesa2.id);
    expect(segunda).toMatchObject({ creada: false, orderId: (primera as { orderId: string }).orderId });

    const cuentas = await db.order.count({ where: { tableId: mesa2.id, status: "ABIERTA" } });
    expect(cuentas).toBe(1);
  });

  it("una mesa que no es de este negocio no abre nada", async () => {
    const [mesaAjena] = await mesasDelNegocio(otro.id);
    expect(await ordenDeMesa(cuenta.id, mesaAjena.id)).toEqual({ error: "No encontramos esa mesa." });
  });
});
