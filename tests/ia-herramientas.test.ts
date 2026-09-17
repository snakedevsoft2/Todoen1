import { afterAll, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import {
  actualizarNegocioIA,
  agregarEmpleadoIA,
  configurarMesasIA,
  crearCategoriaIA,
  crearProductoIA,
  herramientasDeConfiguracion,
} from "../src/lib/ia-herramientas";

/**
 * Lo que el asistente puede crear por si mismo cuando el dueño se lo pide.
 *
 * Lo que se fija: que cada función haga justo lo que promete (con la moneda
 * bien convertida, sin repetir categorías ni usuarios), que nunca borre nada,
 * y que la mesa solo se ofrezca a quien tiene mesas.
 */
const S = "iaherr-" + Date.now();

let contador = 0;
async function negocio(tipo: "OTRO" | "RESTAURANTE", currency = "COP") {
  contador += 1;
  const slug = tipo.toLowerCase() + "-" + contador + "-" + S;
  return db.user.create({
    data: {
      passwordHash: "x",
      ownerName: "Dueño",
      businessType: tipo,
      email: slug + "@test.local",
      businessName: "Negocio " + S,
      slug,
      currency,
    },
  });
}

const cuenta = await negocio("OTRO");
const restaurante = await negocio("RESTAURANTE", "USD");

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [cuenta.id, restaurante.id] } } });
});

describe("crear_producto", () => {
  it("crea el producto con el precio en la unidad mínima de la moneda", async () => {
    const r = await crearProductoIA(cuenta.id, "COP", { nombre: "Café", precio: 3000, categoria: "Bebidas" });
    expect(r).toMatchObject({ ok: true, nombre: "Café", categoria: "Bebidas" });
    const creado = await db.service.findFirst({ where: { userId: cuenta.id, name: "Café" } });
    expect(creado?.price).toBe(3000);

    // USD usa centavos: 3.5 tiene que quedar en 350, no en 3 ni en 350000.
    const enDolares = await crearProductoIA(restaurante.id, "USD", { nombre: "Jugo", precio: 3.5, categoria: "Bebidas" });
    expect(enDolares.ok).toBe(true);
    const conCentavos = await db.service.findFirst({ where: { userId: restaurante.id, name: "Jugo" } });
    expect(conCentavos?.price).toBe(350);
  });

  it("rechaza sin nombre o sin precio, sin crear nada", async () => {
    expect(await crearProductoIA(cuenta.id, "COP", { precio: 1000 })).toEqual({ ok: false, error: "Falta el nombre del producto." });
    expect(await crearProductoIA(cuenta.id, "COP", { nombre: "Gratis", precio: 0 })).toMatchObject({ ok: false });
    expect(await db.service.count({ where: { userId: cuenta.id, name: "Gratis" } })).toBe(0);
  });

  it("junta la categoría si ya existía con otras mayúsculas", async () => {
    await crearCategoriaIA(cuenta.id, { nombre: "Postres" });
    const r = await crearProductoIA(cuenta.id, "COP", { nombre: "Torta", precio: 8000, categoria: "postres" });
    expect(r.categoria).toBe("Postres");
  });
});

describe("crear_categoria", () => {
  it("no la deja repetir", async () => {
    expect(await crearCategoriaIA(cuenta.id, { nombre: "Combos" })).toMatchObject({ ok: true });
    expect(await crearCategoriaIA(cuenta.id, { nombre: "combos" })).toMatchObject({ ok: false });
  });
});

describe("configurar_mesas", () => {
  it("deja el número de mesas pedido, cada una con QR", async () => {
    const r = await configurarMesasIA(restaurante.id, { cantidad: 5 });
    expect(r).toMatchObject({ ok: true });
    expect(await db.table.count({ where: { userId: restaurante.id, active: true } })).toBe(5);
  });

  it("solo se ofrece como herramienta a negocios con mesas", () => {
    const nombres = (t: "OTRO" | "RESTAURANTE") => herramientasDeConfiguracion(t).map((h) => h.name);
    expect(nombres("RESTAURANTE")).toContain("configurar_mesas");
    expect(nombres("OTRO")).not.toContain("configurar_mesas");
  });
});

describe("agregar_empleado", () => {
  it("crea a la persona con usuario y sin contraseña", async () => {
    const r = await agregarEmpleadoIA(cuenta.id, "OTRO", { nombre: "Julián Pérez" });
    expect(r.ok).toBe(true);
    const creado = await db.staff.findFirst({ where: { userId: cuenta.id, name: "Julián Pérez" } });
    expect(creado?.passwordHash).toBeNull();
    expect(creado?.username).toBe("julian.perez");
  });

  it("si el usuario ya existe en cualquier negocio, le agrega un número en vez de fallar", async () => {
    const r = await agregarEmpleadoIA(restaurante.id, "RESTAURANTE", { nombre: "Julián Pérez" });
    expect(r.ok).toBe(true);
    expect(r.usuario).not.toBe("julian.perez");
    const creado = await db.staff.findFirst({ where: { userId: restaurante.id, name: "Julián Pérez" } });
    expect(creado?.username).toMatch(/^julian\.perez\d+$/);
  });

  it("no deja pasar de 20 personas", async () => {
    const lleno = await negocio("OTRO");
    await db.staff.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({ userId: lleno.id, name: "Persona " + i, username: "persona" + i + S })),
    });
    expect(await agregarEmpleadoIA(lleno.id, "OTRO", { nombre: "Una más" })).toEqual({
      ok: false,
      error: "Ya hay 20 personas en el equipo, el máximo. No se puede agregar otra.",
    });
    await db.user.delete({ where: { id: lleno.id } });
  });
});

describe("actualizar_negocio", () => {
  it("cambia solo lo que se le pide, y valida el color", async () => {
    const r = await actualizarNegocioIA(cuenta.id, { nombreDelNegocio: "Snacks El Buen Sabor", colorDeMarca: "f00" });
    expect(r.ok).toBe(true);
    const actualizado = await db.user.findUniqueOrThrow({ where: { id: cuenta.id } });
    expect(actualizado.businessName).toBe("Snacks El Buen Sabor");
    expect(actualizado.brandColor).toBe("#ff0000");
  });

  it("sin ningún dato válido, no cambia nada y avisa", async () => {
    expect(await actualizarNegocioIA(cuenta.id, {})).toEqual({ ok: false, error: "No me diste ningún dato para cambiar." });
  });
});
