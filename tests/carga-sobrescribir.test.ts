import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { analizarClientes, analizarProductos, cargarClientes, cargarProductos } from "../src/lib/carga-masiva";

/**
 * Volver a subir una lista que ya se habia cargado, con otros datos.
 *
 * Lo que se fija: que antes de guardar se sepa cuantos son nuevos, cuantos ya
 * estaban y que les cambia (sin tocar la base); que "completar" solo llene lo
 * que faltaba y "sobrescribir" reemplace; que una celda vacia nunca borre; que
 * el mismo cliente se reconozca por telefono o por correo; y que si el
 * telefono es de uno y el correo de otro no se adivine.
 */
const db = new PrismaClient();
const S = "sobre-" + Date.now();
let userId = "";
let negocio: Parameters<typeof cargarProductos>[0];

beforeAll(async () => {
  const u = await db.user.create({
    data: {
      email: "sobre-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Tienda",
      businessName: "Tienda " + S,
      businessType: "OTRO",
      slug: "tienda-" + S,
    },
  });
  userId = u.id;
  negocio = u;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

const buscar = (name: string) => db.customer.findFirstOrThrow({ where: { userId, name } });

describe("volver a subir la lista de clientes", () => {
  const filas = [
    { name: "Ana María Pérez", phone: "300 123 4567", email: "nueva@correo.com", address: "" },
    { name: "Luis Gómez", phone: "3109876543", email: "LUIS@correo.com" },
    { name: "Pedro Paz", phone: "3205550000" },
    { name: "Marta Ruiz", phone: "3151112233" },
  ];

  it("revisa antes de guardar: cuántos son nuevos y qué cambia, sin tocar nada", async () => {
    await db.customer.createMany({
      data: [
        { userId, name: "Ana Pérez", phone: "3001234567", phoneKey: "3001234567", email: "vieja@correo.com", address: "Calle 1" },
        { userId, name: "Luis Gómez", email: "luis@correo.com" },
        { userId, name: "Pedro Paz", phone: "3205550000", phoneKey: "3205550000" },
      ],
    });
    const a = await analizarClientes(userId, filas);
    expect(a).toMatchObject({ filas: 4, nuevos: 1, repetidos: 3, conCambios: 2, omitidos: 0 });
    expect(a.ejemplos).toEqual([
      {
        nombre: "Ana Pérez",
        cambios: [
          { campo: "nombre", antes: "Ana Pérez", despues: "Ana María Pérez" },
          { campo: "correo", antes: "vieja@correo.com", despues: "nueva@correo.com" },
        ],
      },
      { nombre: "Luis Gómez", cambios: [{ campo: "teléfono", antes: "", despues: "3109876543" }] },
    ]);
    expect(await db.customer.count({ where: { userId } })).toBe(3);
  });

  it("completar solo llena lo que faltaba", async () => {
    expect(await cargarClientes(userId, filas, "completar")).toMatchObject({ creados: 1, actualizados: 1, omitidos: 2 });
    expect((await buscar("Ana Pérez")).email).toBe("vieja@correo.com");
    expect((await buscar("Luis Gómez")).phone).toBe("3109876543");
  });

  it("sobrescribir cambia lo que trae el archivo, y una celda vacía no borra", async () => {
    expect(await cargarClientes(userId, filas, "sobrescribir")).toMatchObject({ creados: 0, actualizados: 1 });
    const ana = await buscar("Ana María Pérez");
    expect([ana.email, ana.phone, ana.address]).toEqual(["nueva@correo.com", "3001234567", "Calle 1"]);
    expect(await db.customer.count({ where: { userId } })).toBe(4);
  });

  it("si el teléfono es de un cliente y el correo de otro, no adivina", async () => {
    const r = await cargarClientes(userId, [{ name: "Luis Gómez", email: "luis@correo.com", phone: "3205550000" }], "sobrescribir");
    expect(r).toMatchObject({ actualizados: 0, omitidos: 1 });
    expect(r.detalle.join(" ")).toContain("coincide con dos clientes distintos");
    expect((await buscar("Pedro Paz")).email).toBeNull();
    expect((await buscar("Luis Gómez")).phone).toBe("3109876543");
  });
});

describe("volver a subir la lista de productos", () => {
  it("revisa, solo agrega los nuevos o sobrescribe", async () => {
    await db.service.create({ data: { userId, name: "Camisa", price: 35000, cost: 18000, category: "Camisas" } });
    const lista = [
      { name: "camisa", price: "39000" },
      { name: "Gorra", price: "20000" },
    ];
    const a = await analizarProductos(negocio, lista);
    expect(a).toMatchObject({ nuevos: 1, repetidos: 1, conCambios: 1 });
    expect(a.ejemplos[0].cambios[0].campo).toBe("precio");
    expect(await db.service.count({ where: { userId } })).toBe(1);

    expect(await cargarProductos(negocio, lista, "completar")).toMatchObject({ creados: 1, actualizados: 0 });
    expect((await db.service.findFirstOrThrow({ where: { userId, name: "Camisa" } })).price).toBe(35000);

    expect(await cargarProductos(negocio, [{ name: "Camisa", price: "39000" }], "sobrescribir")).toMatchObject({ actualizados: 1 });
    expect((await db.service.findFirstOrThrow({ where: { userId, name: "Camisa" } })).price).toBe(39000);
  });
});
