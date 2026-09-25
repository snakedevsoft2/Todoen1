import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { filasDeClientes, filasDeProductos, leerTabla } from "../src/lib/importar";
import { cargarClientes, cargarProductos } from "../src/lib/carga-masiva";
import { registrarVenta } from "../src/lib/ventas";

/**
 * Carga masiva de clientes y productos, y venta a credito.
 *
 * Lo que se fija: que se lea lo que la gente pega de Excel (tabulaciones,
 * punto y coma, comillas, columnas con otro nombre o sin encabezado), que
 * cargar dos veces no duplique, y que una venta a cuentas por cobrar deje la
 * deuda del cliente sin sumar a la caja de hoy.
 */
const db = new PrismaClient();
const S = "carga-" + Date.now();
type Sesion = Parameters<typeof registrarVenta>[0];
let tienda: Sesion;

beforeAll(async () => {
  const u = await db.user.create({
    data: {
      email: "tienda-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Tienda",
      businessName: "Tienda " + S,
      businessType: "ROPA",
      slug: "tienda-" + S,
      staff: { create: { name: "Tienda", role: "DUENO" } },
    },
    include: { staff: true },
  });
  const { staff, ...user } = u;
  tienda = { user, staff: staff[0] };
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

describe("leer lo que se pega de Excel", () => {
  it("reconoce tabulaciones, punto y coma y comillas", () => {
    expect(leerTabla("Nombre\tTeléfono\nAna\t300 123").filas).toEqual([["Ana", "300 123"]]);
    expect(leerTabla('Nombre;Dirección\n"Pérez, Ana";"Calle 5; apto 2"').filas).toEqual([["Pérez, Ana", "Calle 5; apto 2"]]);
    expect(leerTabla("nombre,precio\r\nCamisa,35000\r\n\r\n").filas).toEqual([["Camisa", "35000"]]);
  });

  it("encuentra las columnas aunque cambien de nombre y de orden", () => {
    const r = filasDeClientes("CELULAR\tCorreo Electrónico\tNombre completo\n3001234567\tana@x.co\tAna Pérez\n\t\t");
    expect(r.filas).toEqual([{ name: "Ana Pérez", phone: "3001234567", email: "ana@x.co", document: "", address: "", notes: "" }]);
    expect(r.columnas).toEqual(["name", "phone", "email"]);
  });

  it("sin encabezados, toma las columnas por posición", () => {
    const r = filasDeProductos("Camisa\t35000\t18000\nJean\t89000");
    expect(r.filas.map((f) => [f.name, f.price, f.cost])).toEqual([
      ["Camisa", "35000", "18000"],
      ["Jean", "89000", ""],
    ]);
  });
});

describe("cargar clientes", () => {
  it("no duplica y completa lo que faltaba", async () => {
    const primera = await cargarClientes(tienda.user.id, [
      { name: "Ana Pérez", phone: "300 123 4567" },
      { name: "Luis Gómez" },
      { name: "" },
      { name: "Ana P.", phone: "+57 3001234567" },
    ]);
    // "Ana P." trae el mismo telefono que Ana: es la misma persona.
    expect(primera).toMatchObject({ creados: 2, omitidos: 2 });

    const segunda = await cargarClientes(tienda.user.id, [
      { name: "Ana Pérez", phone: "3001234567", email: "ana@correo.com" },
      { name: "Luis Gómez", phone: "3109876543" },
      { name: "Marta Ruiz", email: "no-es-correo" },
    ]);
    expect(segunda).toMatchObject({ creados: 1, actualizados: 2 });

    const clientes = await db.customer.findMany({ where: { userId: tienda.user.id }, orderBy: { name: "asc" } });
    expect(clientes.map((c) => [c.name, c.phone, c.email])).toEqual([
      ["Ana Pérez", "300 123 4567", "ana@correo.com"],
      ["Luis Gómez", "3109876543", null],
      ["Marta Ruiz", null, null],
    ]);
  });
});

describe("cargar productos", () => {
  it("crea, actualiza precios, ajusta la cantidad y avisa lo que no carga", async () => {
    const u = tienda.user;
    const primera = await cargarProductos(u, [
      { name: "Camisa blanca", price: "35.000", cost: "18000", category: "Camisas", stock: "10" },
      { name: "Gorra", price: "20000" },
      { name: "Sin precio" },
      { name: "gorra", price: "1" },
    ]);
    expect(primera).toMatchObject({ creados: 2, omitidos: 2 });
    expect(primera.detalle.join(" ")).toContain("no tiene precio");

    const camisa = await db.service.findFirstOrThrow({ where: { userId: u.id, name: "Camisa blanca" }, include: { variants: true } });
    expect(camisa.price).toBe(35000);
    expect(camisa.trackStock).toBe(true);
    expect(camisa.variants.map((v) => v.stock)).toEqual([10]);

    const segunda = await cargarProductos(u, [
      { name: "CAMISA BLANCA", price: "39000", stock: "7" },
      { name: "Gorra", stock: "4" },
    ]);
    expect(segunda).toMatchObject({ creados: 0, actualizados: 2 });
    const otra = await db.service.findFirstOrThrow({ where: { id: camisa.id }, include: { variants: true } });
    expect(otra.price).toBe(39000);
    expect(otra.variants[0].stock).toBe(7);
    const gorra = await db.service.findFirstOrThrow({ where: { userId: u.id, name: "Gorra" }, include: { variants: true } });
    expect(gorra.price).toBe(20000);
    expect(gorra.variants.map((v) => v.stock)).toEqual([4]);
  });
});

describe("venta a cuentas por cobrar", () => {
  it("deja la deuda del cliente, descuenta el inventario y no suma a la caja", async () => {
    const camisa = await db.service.findFirstOrThrow({ where: { userId: tienda.user.id, name: "Camisa blanca" }, include: { variants: true } });
    const talla = camisa.variants[0];
    const venta = {
      clientKey: "credito-" + S,
      paymentMethod: "CREDITO",
      clientName: "Doña Marta",
      clientPhone: "3155550000",
      dueDay: "2026-09-30",
      day: "2026-09-14",
      items: [{ serviceId: camisa.id, variantId: talla.id, name: "Camisa blanca", unitPrice: 39000, qty: 2 }],
    };
    const r = await registrarVenta(tienda, venta);
    if (!r.ok) throw new Error(r.error);
    expect(r.datos.tipo).toBe("deuda");

    const deuda = await db.debt.findUniqueOrThrow({ where: { id: r.datos.id } });
    expect(deuda).toMatchObject({ clientName: "Doña Marta", amount: 78000, dueDay: "2026-09-30", alreadyInvoiced: false, status: "PENDIENTE" });
    expect(deuda.concept).toContain("2x Camisa blanca");
    expect(await db.sale.count({ where: { userId: tienda.user.id, day: "2026-09-14" } })).toBe(0);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: talla.id } })).stock).toBe(talla.stock - 2);
    expect(await db.customer.count({ where: { userId: tienda.user.id, name: "Doña Marta" } })).toBe(1);

    // Subida dos veces (sin señal), queda una sola.
    const otra = await registrarVenta(tienda, venta);
    expect(otra.ok && otra.datos).toEqual({ id: r.datos.id, repetido: true, tipo: "deuda", receiptSeq: r.datos.receiptSeq });
    expect(await db.debt.count({ where: { userId: tienda.user.id } })).toBe(1);
  });

  it("sin nombre de cliente no se puede dejar a crédito", async () => {
    const r = await registrarVenta(tienda, { paymentMethod: "CREDITO", manualTotal: "5000" });
    expect(r.ok).toBe(false);
  });

  it("una venta normal con cliente lo deja guardado en Clientes", async () => {
    const r = await registrarVenta(tienda, { manualTotal: "12000", clientName: "Pedro Nuevo", clientPhone: "3201112233" });
    if (!r.ok) throw new Error(r.error);
    expect(r.datos.tipo).toBe("venta");
    const pedro = await db.customer.findFirst({ where: { userId: tienda.user.id, name: "Pedro Nuevo" } });
    expect(pedro?.phone).toBe("3201112233");
  });
});
