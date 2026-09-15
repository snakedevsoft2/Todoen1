import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { confirmaNombre, eliminarCuenta } from "../src/lib/eliminar-cuenta";

/**
 * Eliminar una cuenta desde el panel de la plataforma.
 *
 * Lo que se fija: que sin el nombre exacto no se borra nada, que no se puede
 * eliminar la propia ni una de administrador, y que la cuenta se va con todo
 * (tambien las ventas con factura autorizada) sin tocar a las demas.
 */
const db = new PrismaClient();
const S = "eliminar-" + Date.now();
const correoJefe = "jefe-" + S + "@test.local";
const esAdmin = (c: string) => c.trim().toLowerCase() === correoJefe;
const HOY = "2026-09-14";

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

async function cuenta(nombre: string, email = nombre + "-" + S + "@test.local") {
  return db.user.create({
    data: {
      email,
      passwordHash: "x",
      ownerName: nombre,
      businessName: "Negocio " + nombre,
      businessType: "OTRO",
      slug: nombre + "-" + S,
      staff: { create: [{ name: nombre, role: "DUENO" }, { name: "Ayudante", role: "VENDEDOR" }] },
      expenses: { create: { day: HOY, amount: 5000, description: "Hielo" } },
      debts: { create: { clientName: "Juan", concept: "Fiado", amount: 20000, day: HOY } },
    },
  });
}

describe("eliminar una cuenta", () => {
  it("el nombre se compara sin mayúsculas ni espacios de sobra", () => {
    expect(confirmaNombre("  negocio   ANA ", "Negocio Ana")).toBe(true);
    expect(confirmaNombre("Negocio", "Negocio Ana")).toBe(false);
    expect(confirmaNombre("   ", "   ")).toBe(false);
  });

  it("sin el nombre exacto no borra nada", async () => {
    const c = await cuenta("nombre");
    const r = await eliminarCuenta({ userId: c.id, confirmacion: "Negocio otro", adminUserId: "nadie", esAdmin });
    expect(r).toEqual({ ok: false, error: "Escribe el nombre del negocio tal cual para confirmar." });
    expect(await db.user.count({ where: { id: c.id } })).toBe(1);
  });

  it("no deja eliminar la propia cuenta ni una de administrador", async () => {
    const propia = await cuenta("propia");
    const r1 = await eliminarCuenta({ userId: propia.id, confirmacion: "Negocio propia", adminUserId: propia.id, esAdmin });
    expect(r1.ok).toBe(false);

    const jefe = await cuenta("jefe", correoJefe);
    const r2 = await eliminarCuenta({ userId: jefe.id, confirmacion: "Negocio jefe", adminUserId: "otro", esAdmin });
    expect(r2).toMatchObject({ ok: false, error: expect.stringContaining("ADMIN_EMAILS") });

    // Tambien si el administrador es un empleado de esa cuenta.
    const conJefe = await cuenta("conjefe");
    await db.staff.create({ data: { userId: conJefe.id, name: "Jefe", role: "VENDEDOR", email: correoJefe.toUpperCase() } });
    const r3 = await eliminarCuenta({ userId: conJefe.id, confirmacion: "Negocio conjefe", adminUserId: "otro", esAdmin });
    expect(r3.ok).toBe(false);

    expect(await db.user.count({ where: { id: { in: [propia.id, jefe.id, conJefe.id] } } })).toBe(3);
  });

  it("se va con todo, también las ventas con factura autorizada, y no toca otra cuenta", async () => {
    const a = await cuenta("borrar");
    const b = await cuenta("queda");
    const venta = await db.sale.create({ data: { userId: a.id, day: HOY, total: 11900 } });
    await db.electronicInvoice.create({
      data: {
        userId: a.id,
        saleId: venta.id,
        country: "CO",
        environment: "pruebas",
        status: "AUTORIZADA",
        customer: { consumidorFinal: true },
        subtotal: 10000,
        tax: 1900,
        total: 11900,
      },
    });

    const r = await eliminarCuenta({ userId: a.id, confirmacion: " negocio BORRAR ", adminUserId: b.id, esAdmin });
    expect(r).toEqual({ ok: true, businessName: "Negocio borrar" });

    expect(await db.user.count({ where: { id: a.id } })).toBe(0);
    expect(await db.staff.count({ where: { userId: a.id } })).toBe(0);
    expect(await db.sale.count({ where: { userId: a.id } })).toBe(0);
    expect(await db.electronicInvoice.count({ where: { userId: a.id } })).toBe(0);
    expect(await db.expense.count({ where: { userId: a.id } })).toBe(0);
    expect(await db.debt.count({ where: { userId: a.id } })).toBe(0);

    expect(await db.user.count({ where: { id: b.id } })).toBe(1);
    expect(await db.expense.count({ where: { userId: b.id } })).toBe(1);
    expect(await db.staff.count({ where: { userId: b.id } })).toBe(2);

    expect(await eliminarCuenta({ userId: a.id, confirmacion: "Negocio borrar", adminUserId: b.id, esAdmin })).toEqual({
      ok: false,
      error: "Esa cuenta ya no existe.",
    });
  });
});
