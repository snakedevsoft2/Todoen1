import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { categoriasConCantidad, validarNombreCategoria } from "../src/lib/categorias";
import {
  asegurarCategorias,
  asignarProductos,
  borrarCategoria,
  categoriasDelNegocio,
  crearCategoria,
  moverCategoria,
  renombrarCategoria,
  sincronizarCategorias,
} from "../src/lib/categorias-negocio";

/**
 * Categorias a gusto de cada negocio.
 *
 * Lo que se fija: que no se repitan por mayusculas o tildes, que el orden del
 * dueño mande en todas las listas, que renombrar se lleve los productos (y
 * junte si el nombre ya existe), que borrar nunca borre productos y que
 * asignar solo toque productos del mismo negocio.
 */
const S = "catprop-" + Date.now();
let userId = "";
let otroId = "";
let otroProducto = "";

const nombres = async () => (await categoriasDelNegocio(userId)).map((c) => c.name);
const idDe = async (name: string) => (await categoriasDelNegocio(userId)).find((c) => c.name === name)?.id ?? "";
const producto = (name: string) => db.service.findFirstOrThrow({ where: { userId, name } });

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
          { name: "Agua", price: 1, category: "Bebidas" },
          { name: "Soda", price: 1, category: "Bebidas" },
          { name: "Jugo", price: 1, category: "  bebidas " },
          { name: "Torta", price: 1, category: "Postres" },
          { name: "Bolsa", price: 1, category: "" },
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
  otroProducto = otro.services[0].id;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [userId, otroId] } } });
});

describe("categorías propias", () => {
  it("valida el nombre", () => {
    expect(validarNombreCategoria("   Combos   de  la casa ")).toEqual({ nombre: "Combos de la casa" });
    expect(validarNombreCategoria("  ")).toHaveProperty("error");
    expect(validarNombreCategoria("GENERAL")).toHaveProperty("error");
  });

  it("el orden propio manda y General va de última", () => {
    const items = ["A", "Z", "General", "B", "Nueva"].map((category) => ({ category }));
    expect(categoriasConCantidad(items, ["Z", "B"]).map((c) => c.nombre)).toEqual(["Z", "B", "A", "Nueva", "General"]);
  });

  it("junta las que solo cambian en mayúsculas o espacios", async () => {
    await sincronizarCategorias(userId);
    expect(await nombres()).toEqual(["Bebidas", "Postres"]);
    expect((await producto("Jugo")).category).toBe("Bebidas");
    expect((await producto("Bolsa")).category).toBe("General");

    const mapa = await asegurarCategorias(userId, ["BEBIDAS", "Snacks", "general"]);
    expect(mapa.get("BEBIDAS")).toBe("Bebidas");
    expect(mapa.get("general")).toBe("General");
    expect(await nombres()).toEqual(["Bebidas", "Postres", "Snacks"]);
  });

  it("crea sin repetir y ordena con las flechas", async () => {
    expect(await crearCategoria(userId, "Promos")).toHaveProperty("ok");
    expect(await crearCategoria(userId, "PROMOS")).toEqual({ error: "Ya tienes la categoría Promos." });
    expect(await crearCategoria(userId, "general")).toHaveProperty("error");

    const promos = await idDe("Promos");
    await moverCategoria(userId, promos, "arriba");
    await moverCategoria(userId, promos, "arriba");
    await moverCategoria(userId, promos, "arriba");
    expect(await nombres()).toEqual(["Promos", "Bebidas", "Postres", "Snacks"]);
    expect(await moverCategoria(userId, promos, "arriba")).toHaveProperty("ok");
    expect((await nombres())[0]).toBe("Promos");
  });

  it("asigna productos y solo los de este negocio", async () => {
    const promos = await idDe("Promos");
    const [agua, bolsa] = await Promise.all([producto("Agua"), producto("Bolsa")]);
    await asignarProductos(userId, promos, [agua.id, bolsa.id, otroProducto]);
    expect((await producto("Agua")).category).toBe("Promos");
    expect((await producto("Bolsa")).category).toBe("Promos");
    expect((await db.service.findUniqueOrThrow({ where: { id: otroProducto } })).category).toBe("Suyo");

    await asignarProductos(userId, promos, [agua.id]);
    expect((await producto("Bolsa")).category).toBe("General");
    expect(await asignarProductos(userId, await idDe("Postres"), [otroProducto])).toHaveProperty("ok");
    expect((await producto("Torta")).category).toBe("General");
  });

  it("renombrar se lleva los productos y junta si el nombre ya existe", async () => {
    await renombrarCategoria(userId, await idDe("Promos"), "Ofertas");
    expect((await producto("Agua")).category).toBe("Ofertas");

    const r = await renombrarCategoria(userId, await idDe("Ofertas"), "bebidas");
    expect(r).toHaveProperty("ok");
    expect((await producto("Agua")).category).toBe("Bebidas");
    expect(await nombres()).toEqual(["Bebidas", "Postres", "Snacks"]);
  });

  it("borrar deja los productos en General y no toca otro negocio", async () => {
    expect(await borrarCategoria(userId, await idDe("Bebidas"))).toHaveProperty("ok");
    expect((await producto("Soda")).category).toBe("General");
    expect(await nombres()).toEqual(["Postres", "Snacks"]);

    const ajena = await asegurarCategorias(otroId, ["Suyo"]);
    const idAjena = (await categoriasDelNegocio(otroId)).find((c) => c.name === ajena.get("Suyo"))?.id ?? "";
    expect(await borrarCategoria(userId, idAjena)).toEqual({ error: "No encontramos esa categoría." });
    expect(await renombrarCategoria(userId, idAjena, "Mía")).toEqual({ error: "No encontramos esa categoría." });
  });
});
