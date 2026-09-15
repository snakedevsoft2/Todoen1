import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { borrarClientes } from "../src/lib/borrar-clientes";

/**
 * Borrar clientes de a varios.
 *
 * Lo que se fija: que se borren solo los marcados y solo los del negocio (un
 * id de otro negocio en la lista no borra nada), que "todos" respete la
 * busqueda, que sin elegir a nadie no se borre, y que las ventas se queden.
 */
const db = new PrismaClient();
const S = "borrarcli-" + Date.now();
let uno = "";
let otro = "";

async function negocio(nombre: string) {
  const u = await db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: nombre,
      businessName: nombre + " " + S,
      businessType: "OTRO",
      slug: nombre + "-" + S,
    },
  });
  return u.id;
}

beforeAll(async () => {
  uno = await negocio("uno");
  otro = await negocio("otro");
  await db.customer.createMany({
    data: [
      { userId: uno, name: "Ana" },
      { userId: uno, name: "Andrés" },
      { userId: uno, name: "Andrea" },
      { userId: uno, name: "Beto" },
      { userId: otro, name: "Zoe" },
    ],
  });
  await db.sale.create({ data: { userId: uno, day: "2026-09-14", total: 5000, clientName: "Beto" } });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

describe("borrar varios clientes", () => {
  it("borra los marcados, y solo los del negocio", async () => {
    const ana = await db.customer.findFirstOrThrow({ where: { userId: uno, name: "Ana" } });
    const zoe = await db.customer.findFirstOrThrow({ where: { userId: otro, name: "Zoe" } });
    expect(await borrarClientes(uno, { ids: [ana.id, zoe.id] })).toEqual({ ok: true, borrados: 1 });
    expect(await db.customer.count({ where: { id: zoe.id } })).toBe(1);
  });

  it("todos los de la búsqueda, o todos los del negocio", async () => {
    expect(await borrarClientes(uno, { todos: true, q: "andr" })).toEqual({ ok: true, borrados: 2 });
    expect((await db.customer.findMany({ where: { userId: uno } })).map((c) => c.name)).toEqual(["Beto"]);

    expect(await borrarClientes(uno, { todos: true })).toEqual({ ok: true, borrados: 1 });
    expect(await db.customer.count({ where: { userId: uno } })).toBe(0);
    expect(await db.customer.count({ where: { userId: otro } })).toBe(1);
    // La venta de Beto sigue: es de la caja.
    expect(await db.sale.count({ where: { userId: uno, clientName: "Beto" } })).toBe(1);
  });

  it("sin elegir a nadie no borra", async () => {
    expect(await borrarClientes(otro, { ids: [] })).toMatchObject({ ok: false });
    expect(await borrarClientes(otro, null)).toMatchObject({ ok: false });
    expect(await db.customer.count({ where: { userId: otro } })).toBe(1);
  });
});
