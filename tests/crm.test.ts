import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  aplicarPlantilla,
  diasSinContacto,
  estadoSeguimiento,
  llaveNombre,
  llaveTelefono,
  resumenEmbudo,
  tasaDeCierre,
  valorAbierto,
} from "../src/lib/crm";
import {
  anotarCliente,
  esDelCliente,
  historialDe,
  importarClientes,
  whereDeSegmento,
} from "../src/lib/clientes";

/**
 * El CRM.
 *
 * Lo que se fija aqui: que la misma persona no quede partida en varias fichas
 * por como se escribio el telefono, que dos personas distintas no se junten
 * por llamarse igual, y que ningun filtro alcance clientes de otro negocio.
 */
const db = new PrismaClient();
const S = "crm-" + Date.now();

async function cuenta(nombre: string) {
  return db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: nombre,
      businessName: "Negocio " + nombre,
      businessType: "ROPA",
      slug: nombre + "-" + S,
      staff: { create: { name: "Dueña " + nombre, role: "DUENO" } },
    },
  });
}

let A: { id: string };
let B: { id: string };

beforeAll(async () => {
  A = await cuenta("a");
  B = await cuenta("b");
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [A.id, B.id] } } });
  await db.$disconnect();
});

describe("reglas sin base de datos", () => {
  it("reconoce el mismo telefono escrito de varias formas", () => {
    expect(llaveTelefono("300 123 4567")).toBe("3001234567");
    expect(llaveTelefono("+57 300-123-4567")).toBe("3001234567");
    expect(llaveTelefono("573001234567")).toBe("3001234567");
    expect(llaveTelefono("12345")).toBeNull();
    expect(llaveTelefono(null)).toBeNull();
  });

  it("compara nombres sin tildes ni mayusculas", () => {
    expect(llaveNombre("  María   JOSÉ ")).toBe("maria jose");
  });

  it("agrupa los seguimientos por fecha", () => {
    const hoy = "2026-09-13";
    expect(estadoSeguimiento({ dueDay: "2026-09-12", doneAt: null }, hoy)).toBe("atrasado");
    expect(estadoSeguimiento({ dueDay: hoy, doneAt: null }, hoy)).toBe("hoy");
    expect(estadoSeguimiento({ dueDay: "2026-09-20", doneAt: null }, hoy)).toBe("proximo");
    expect(estadoSeguimiento({ dueDay: "2026-09-01", doneAt: new Date() }, hoy)).toBe("hecho");
  });

  it("llena la plantilla con el primer nombre", () => {
    expect(aplicarPlantilla("Hola {nombre}, soy de {negocio}. {NOMBRE}", { nombre: "Carlos Andrés Pérez", negocio: "La Tienda" })).toBe(
      "Hola Carlos, soy de La Tienda. Carlos"
    );
  });

  it("resume el embudo y no inventa una tasa sin datos", () => {
    const vacio = resumenEmbudo([]);
    expect(tasaDeCierre(vacio)).toBeNull();

    const r = resumenEmbudo([
      { stage: "NUEVO", value: 100 },
      { stage: "NEGOCIACION", value: 300 },
      { stage: "GANADO", value: 500 },
      { stage: "GANADO", value: 200 },
      { stage: "PERDIDO", value: 50 },
      { stage: "INVENTADO", value: 999 },
    ]);
    expect(r.GANADO).toEqual({ cuantos: 2, valor: 700 });
    expect(valorAbierto(r)).toBe(400);
    expect(tasaDeCierre(r)).toBe(67);
  });

  it("cuenta los dias sin contacto", () => {
    const ahora = new Date("2026-09-13T12:00:00Z");
    expect(diasSinContacto(null, ahora)).toBeNull();
    expect(diasSinContacto(new Date("2026-09-10T12:00:00Z"), ahora)).toBe(3);
  });

  it("un registro con otro telefono no es del cliente aunque se llame igual", () => {
    const carlos = { name: "Carlos", phoneKey: "3001234567" };
    expect(esDelCliente(carlos, { clientName: "carlos", clientPhone: "300 123 4567" })).toBe(true);
    expect(esDelCliente(carlos, { clientName: "Carlos", clientPhone: "3119998888" })).toBe(false);
    expect(esDelCliente(carlos, { clientName: "Carlos", clientPhone: null })).toBe(true);
    expect(esDelCliente(carlos, { clientName: "Pedro", clientPhone: "+57 300 123 4567" })).toBe(true);
  });
});

describe("anotarCliente", () => {
  it("no duplica a la misma persona", async () => {
    const uno = await anotarCliente(A.id, { name: "Laura Ríos", phone: "300 555 0001", source: "reserva" });
    const dos = await anotarCliente(A.id, { name: "Laura", phone: "+57 3005550001", source: "turno" });
    expect(uno).toBeTruthy();
    expect(dos).toBe(uno);
  });

  it("le pone el telefono a la ficha que no tenia", async () => {
    const sin = await anotarCliente(A.id, { name: "Mario Díaz", source: "importado" });
    const con = await anotarCliente(A.id, { name: "mario díaz", phone: "3105550002", source: "cartera" });
    expect(con).toBe(sin);
    const ficha = await db.customer.findUnique({ where: { id: sin! } });
    expect(ficha?.phoneKey).toBe("3105550002");
  });

  it("dos personas con el mismo nombre y distinto telefono son dos fichas", async () => {
    const x = await anotarCliente(A.id, { name: "Ana", phone: "3205550003", source: "manual" });
    const y = await anotarCliente(A.id, { name: "Ana", phone: "3205550004", source: "manual" });
    expect(x).not.toBe(y);
  });

  it("el mismo telefono en otro negocio es otro cliente", async () => {
    const enA = await anotarCliente(A.id, { name: "Laura Ríos", phone: "3005550001", source: "reserva" });
    const enB = await anotarCliente(B.id, { name: "Laura Ríos", phone: "3005550001", source: "reserva" });
    expect(enB).toBeTruthy();
    expect(enB).not.toBe(enA);
  });

  it("no revienta con un nombre vacio", async () => {
    expect(await anotarCliente(A.id, { name: "   ", source: "manual" })).toBeNull();
  });
});

describe("importarClientes", () => {
  it("trae los clientes regados y se puede repetir sin duplicar", async () => {
    await db.debt.create({
      data: { userId: A.id, clientName: "Pedro Gil", clientPhone: "311-555-0010", concept: "Fiado", amount: 5000, day: "2026-09-01" },
    });
    await db.appointment.create({
      data: {
        userId: A.id,
        serviceName: "Corte",
        clientName: "Pedro Gil",
        clientPhone: "+57 311 555 0010",
        day: "2026-09-02",
        startTime: "10:00",
        endTime: "10:30",
      },
    });
    await db.sale.create({ data: { userId: A.id, day: "2026-09-03", total: 9000, clientName: "Pedro Gil" } });
    await db.sale.create({ data: { userId: A.id, day: "2026-09-03", total: 1000, clientName: "Cliente" } });

    const primera = await importarClientes(A.id);
    expect(primera.creados).toBe(1);
    const segunda = await importarClientes(A.id);
    expect(segunda.creados).toBe(0);

    const pedros = await db.customer.findMany({ where: { userId: A.id, name: "Pedro Gil" } });
    expect(pedros).toHaveLength(1);
    expect(pedros[0].phoneKey).toBe("3115550010");
    // Nada de esto llega al otro negocio.
    expect(await db.customer.count({ where: { userId: B.id, name: "Pedro Gil" } })).toBe(0);
  });

  it("arma el historial por telefono aunque este escrito distinto", async () => {
    const pedro = await db.customer.findFirstOrThrow({ where: { userId: A.id, name: "Pedro Gil" } });
    const h = await historialDe(A.id, pedro);
    expect(h.deudas).toHaveLength(1);
    expect(h.citas).toHaveLength(1);
    expect(h.totalComprado).toBe(9000);
    expect(h.saldoPendiente).toBe(5000);
    // El mismo cliente consultado desde el otro negocio no ve nada.
    const desdeB = await historialDe(B.id, pedro);
    expect(desdeB.deudas.length + desdeB.citas.length + desdeB.ventas.length).toBe(0);
  });
});

describe("segmentos", () => {
  it("combina etiquetas, etapa, pendientes y dias sin contacto", async () => {
    const vip = await db.customerTag.create({ data: { userId: A.id, name: "VIP " + S } });
    const mayor = await db.customerTag.create({ data: { userId: A.id, name: "Mayorista " + S } });

    const c1 = await db.customer.create({ data: { userId: A.id, name: "Seg Uno " + S, lastContactAt: new Date() } });
    const c2 = await db.customer.create({
      data: { userId: A.id, name: "Seg Dos " + S, lastContactAt: new Date(Date.now() - 40 * 86_400_000) },
    });
    await db.customerTagLink.createMany({
      data: [
        { customerId: c1.id, tagId: vip.id, userId: A.id },
        { customerId: c1.id, tagId: mayor.id, userId: A.id },
        { customerId: c2.id, tagId: vip.id, userId: A.id },
      ],
    });
    await db.deal.create({ data: { userId: A.id, customerId: c2.id, title: "Pedido", stage: "NEGOCIACION" } });
    await db.followUp.create({ data: { userId: A.id, customerId: c1.id, title: "Llamar", dueDay: "2026-09-13" } });

    const ids = async (f: Parameters<typeof whereDeSegmento>[1]) =>
      (await db.customer.findMany({ where: whereDeSegmento(A.id, f), select: { id: true } })).map((c) => c.id).sort();

    expect(await ids({ etiquetas: [vip.id] })).toEqual([c1.id, c2.id].sort());
    expect(await ids({ etiquetas: [vip.id, mayor.id] })).toEqual([c1.id]);
    expect(await ids({ etiquetas: [vip.id], etapa: "NEGOCIACION" })).toEqual([c2.id]);
    expect(await ids({ etiquetas: [vip.id], sinContactoDias: 30 })).toEqual([c2.id]);
    expect(await ids({ etiquetas: [vip.id], conPendientes: true })).toEqual([c1.id]);
    expect(await ids({ q: "seg dos " + S.toUpperCase() })).toEqual([c2.id]);
  });

  it("una etiqueta de otro negocio no trae a nadie", async () => {
    const ajena = await db.customerTag.create({ data: { userId: B.id, name: "Ajena " + S } });
    const deB = await db.customer.create({ data: { userId: B.id, name: "Cliente B " + S } });
    await db.customerTagLink.create({ data: { customerId: deB.id, tagId: ajena.id, userId: B.id } });

    const desdeA = await db.customer.findMany({ where: whereDeSegmento(A.id, { etiquetas: [ajena.id] }) });
    expect(desdeA).toHaveLength(0);
    const todosA = await db.customer.findMany({ where: whereDeSegmento(A.id, {}), select: { userId: true } });
    expect(todosA.every((c) => c.userId === A.id)).toBe(true);
  });
});
