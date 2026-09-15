import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { categoriasDelNegocio, crearCategoria, moverProductos } from "../src/lib/categorias-negocio";

/**
 * Seleccionar productos en la lista y meterlos en una categoria.
 *
 * Lo que se fija: que pasen todos los elegidos, que una categoria nueva quede
 * creada al final, que escribirla con otras mayusculas use la que ya existe,
 * que "General" funcione como destino y que nunca se muevan productos de otro
 * negocio.
 */
const S = "mover-" + Date.now();
let userId = "";
let otroId = "";
let ajeno = "";

const producto = (name: string) => db.service.findFirstOrThrow({ where: { userId, name } });
const nombres = async () => (await categoriasDelNegocio(userId)).map((c) => c.name);

beforeAll(async () => {
  const base = { passwordHash: "x", ownerName: "Dueña", businessType: "OTRO" as const };
  const u = await db.user.create({
    data: {
      ...base,
      email: S + "@test.local",
      businessName: "Negocio " + S,
      slug: S,
      services: {
        create: [
          { name: "Torta", price: 1, category: "General" },
          { name: "Soda", price: 1, category: "General" },
          { name: "Brownie", price: 1, category: "General" },
        ],
      },
    },
  });
  userId = u.id;
  const otro = await db.user.create({
    data: {
      ...base,
      email: "otro-" + S + "@test.local",
      businessName: "Otro " + S,
      slug: "otro-" + S,
      services: { create: [{ name: "Ajeno", price: 1, category: "Suyo" }] },
    },
    include: { services: true },
  });
  otroId = otro.id;
  ajeno = otro.services[0].id;
  await crearCategoria(userId, "Postres");
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [userId, otroId] } } });
});

describe("mover productos a una categoría", () => {
  it("pasa todos los elegidos a una categoría ya creada", async () => {
    const [torta, brownie] = await Promise.all([producto("Torta"), producto("Brownie")]);
    expect(await moverProductos(userId, [torta.id, brownie.id], "Postres")).toEqual({ ok: "2 productos pasaron a Postres." });
    expect((await producto("Brownie")).category).toBe("Postres");
    expect((await producto("Soda")).category).toBe("General");
  });

  it("crea la categoría si es nueva y no la repite por mayúsculas", async () => {
    const soda = await producto("Soda");
    expect(await moverProductos(userId, [soda.id], "  Bebidas   frías ")).toEqual({ ok: "1 producto pasó a Bebidas frías." });
    expect(await nombres()).toEqual(["Postres", "Bebidas frías"]);

    const torta = await producto("Torta");
    expect(await moverProductos(userId, [torta.id], "BEBIDAS FRIAS")).toEqual({ ok: "1 producto pasó a Bebidas frías." });
    expect(await nombres()).toEqual(["Postres", "Bebidas frías"]);
  });

  it("General sirve de destino y no se crea como categoría", async () => {
    const torta = await producto("Torta");
    expect(await moverProductos(userId, [torta.id], "general")).toEqual({ ok: "1 producto pasó a General." });
    expect((await producto("Torta")).category).toBe("General");
    expect(await nombres()).toEqual(["Postres", "Bebidas frías"]);
  });

  it("no mueve productos de otro negocio ni acepta la lista vacía", async () => {
    expect(await moverProductos(userId, [ajeno], "Postres")).toEqual({ error: "No encontramos esos productos." });
    expect((await db.service.findUniqueOrThrow({ where: { id: ajeno } })).category).toBe("Suyo");
    expect(await moverProductos(userId, [], "Postres")).toEqual({ error: "Elige al menos un producto." });
    expect(await moverProductos(userId, [(await producto("Soda")).id], "   ")).toEqual({ ok: "1 producto pasó a General." });
  });
});
