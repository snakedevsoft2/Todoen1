import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { cambiarTipoDeNegocio } from "../src/lib/tipo-negocio";

/**
 * Cambiar el tipo de negocio sin crear otra cuenta.
 *
 * Nacio de un caso real: alguien se registro con el tipo equivocado. Lo que se
 * fija: que no se pierda ningun dato, que el menu arranque de cero con el
 * oficio nuevo, que el equipo tome el rol del oficio nuevo y que no se pueda
 * elegir un tipo que no esta abierto.
 */
const db = new PrismaClient();
const S = "tipo-" + Date.now();
let cuenta: Awaited<ReturnType<typeof crear>>;

function crear(conProductos: boolean) {
  return db.user.create({
    data: {
      email: "tipo-" + (conProductos ? "a" : "b") + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Luis",
      businessName: "Negocio " + S,
      businessType: "ROPA",
      slug: "tipo-" + (conProductos ? "a" : "b") + "-" + S,
      staff: {
        create: [
          { name: "Luis", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date(), navHidden: "/panel/ventas" },
          { name: "Ana", role: "VENDEDOR", onboardingDoneAt: new Date() },
        ],
      },
      ...(conProductos ? { services: { create: { name: "Camisa", price: 50000 } } } : {}),
    },
    include: { staff: true },
  });
}

beforeAll(async () => {
  cuenta = await crear(true);
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

describe("cambiar el tipo de negocio", () => {
  it("cambia el tipo sin perder datos y deja el menu de fabrica", async () => {
    const dueno = cuenta.staff.find((s) => s.role === "DUENO")!;
    await db.workspaceConfig.create({ data: { userId: cuenta.id, staffId: dueno.id, hiddenKeys: "ventas,gastos", orderKeys: "" } });
    await db.sale.create({ data: { userId: cuenta.id, day: "2026-09-10", total: 50000 } });

    const r = await cambiarTipoDeNegocio(cuenta.id, "BARBERIA");
    expect(r).toEqual({ ok: true, cambio: true });

    const u = await db.user.findUniqueOrThrow({ where: { id: cuenta.id }, include: { staff: true, services: true } });
    expect(u.businessType).toBe("BARBERIA");
    // Nada se borra.
    expect(await db.sale.count({ where: { userId: cuenta.id } })).toBe(1);
    expect(u.services.map((s) => s.name)).toEqual(["Camisa"]);
    // El menu vuelve a ser el de fabrica, tambien el guardado a la antigua.
    expect(await db.workspaceConfig.count({ where: { userId: cuenta.id } })).toBe(0);
    const nuevoDueno = u.staff.find((s) => s.role === "DUENO")!;
    expect(nuevoDueno.navHidden).toBeNull();
    // El dueño ve la bienvenida otra vez; el equipo toma el rol del oficio.
    expect(nuevoDueno.onboardingDoneAt).toBeNull();
    expect(nuevoDueno.tourDoneAt).toBeNull();
    expect(u.staff.find((s) => s.name === "Ana")?.role).toBe("BARBERO");
  });

  it("volver al tipo de antes deja todo como estaba", async () => {
    const r = await cambiarTipoDeNegocio(cuenta.id, "ROPA");
    expect(r).toEqual({ ok: true, cambio: true });
    const u = await db.user.findUniqueOrThrow({ where: { id: cuenta.id }, include: { staff: true } });
    expect(u.businessType).toBe("ROPA");
    expect(u.staff.find((s) => s.name === "Ana")?.role).toBe("VENDEDOR");
    expect(await db.sale.count({ where: { userId: cuenta.id } })).toBe(1);
  });

  it("si no tenia productos, le deja los de ejemplo del oficio nuevo", async () => {
    const vacia = await crear(false);
    await cambiarTipoDeNegocio(vacia.id, "BARBERIA");
    const servicios = await db.service.findMany({ where: { userId: vacia.id } });
    expect(servicios.length).toBeGreaterThan(0);
    expect(servicios.every((s) => s.bookable)).toBe(true);
  });

  it("no acepta tipos inventados ni cerrados, y el mismo tipo no hace nada", async () => {
    expect((await cambiarTipoDeNegocio(cuenta.id, "NAVE_ESPACIAL")).ok).toBe(false);
    expect((await cambiarTipoDeNegocio(cuenta.id, "DISTRIBUIDORA")).ok).toBe(false);
    expect(await cambiarTipoDeNegocio(cuenta.id, "ROPA")).toEqual({ ok: true, cambio: false });
    expect((await cambiarTipoDeNegocio("no-existe", "ROPA")).ok).toBe(false);
  });
});
