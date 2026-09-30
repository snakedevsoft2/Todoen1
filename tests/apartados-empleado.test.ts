import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { modulosDe, puedeUsar, rutaPermitida } from "../src/lib/modules";
import { queRecibe } from "../src/lib/push-textos";

/**
 * Que puede usar cada empleado (Empleados > Que puede usar): el dueño le
 * prende a una persona solo Marcar, a otra solo Ventas... Lo apagado no sale en
 * su menu, no se abre por la direccion y la API tampoco lo deja usar.
 *
 * Necesita el catalogo sembrado (npm run db:modulos): "Otro negocio" trae
 * Marcar, Planilla, Sitios y Novedades apagados de fabrica.
 */
const db = new PrismaClient();
const S = "apartados-" + Date.now();

let user: { id: string; businessType: string };
let otro: { id: string; businessType: string };
let dueno: { id: string; role: string };
let cajera: { id: string; role: string };
let vigilante: { id: string; role: string };

const visibles = async (staff: { id: string; role: string }) =>
  (await modulosDe({ user, staff })).filter((m) => m.visible).map((m) => m.key);

beforeAll(async () => {
  const u = await db.user.create({
    data: {
      email: "t-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Dueño",
      businessName: "Tienda " + S,
      businessType: "OTRO",
      slug: "t-" + S,
      staff: {
        create: [
          { name: "Dueño", role: "DUENO" },
          { name: "Cajera", role: "VENDEDOR" },
          { name: "Vigilante", role: "VENDEDOR" },
        ],
      },
    },
    include: { staff: true },
  });
  user = { id: u.id, businessType: "OTRO" };
  dueno = u.staff.find((s) => s.role === "DUENO")!;
  cajera = u.staff.find((s) => s.name === "Cajera")!;
  vigilante = u.staff.find((s) => s.name === "Vigilante")!;

  const o = await db.user.create({
    data: { email: "o-" + S + "@test.local", passwordHash: "x", ownerName: "O", businessName: "Otro " + S, businessType: "OTRO", slug: "o-" + S },
  });
  otro = { id: o.id, businessType: "OTRO" };
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

describe("qué puede usar cada empleado", () => {
  it("sin menú propio usa el del negocio: vende, pero no marca (Marcar viene apagado)", async () => {
    const v = await visibles(cajera);
    expect(v).toContain("ventas");
    expect(v).not.toContain("marcar");
    expect(await puedeUsar({ user, staff: cajera }, "marcar")).toBe(false);
  });

  it("el dueño le deja solo Marcar al vigilante: marca, y ya no vende", async () => {
    const todos = (await modulosDe({ user, staff: vigilante })).map((m) => m.key);
    await db.workspaceConfig.create({
      data: {
        userId: user.id,
        staffId: vigilante.id,
        hiddenKeys: todos.filter((k) => k !== "marcar").join(","),
        orderKeys: todos.join(","),
      },
    });

    const v = await visibles(vigilante);
    expect(v).toContain("marcar");
    expect(v).not.toContain("ventas");
    expect(await puedeUsar({ user, staff: vigilante }, "marcar")).toBe(true);
    expect(await puedeUsar({ user, staff: vigilante }, "ventas")).toBe(false);
    // Y se le ofrecen las notificaciones de marcar.
    expect(queRecibe("VENDEDOR", "OTRO", v.includes("marcar"))).toContain("marcar");
  });

  it("el menú del vigilante no le cambia nada a la cajera", async () => {
    expect(await visibles(cajera)).toContain("ventas");
    expect(await puedeUsar({ user, staff: cajera }, "marcar")).toBe(false);
  });

  it("lo apagado tampoco se abre escribiendo la dirección", async () => {
    const mods = await modulosDe({ user, staff: vigilante });
    expect(rutaPermitida(mods, "/panel/marcar")).toBe(true);
    expect(rutaPermitida(mods, "/panel/ventas")).toBe(false);
    // Lo que no es de ningún apartado (Mi perfil) y el resumen siempre se abren.
    expect(rutaPermitida(mods, "/panel/perfil")).toBe(true);
    expect(rutaPermitida(mods, "/panel")).toBe(true);
  });

  it("el menú propio de un empleado no se mezcla con otro negocio", async () => {
    // Una persona de otro negocio con el mismo id de staff no existe, pero la
    // consulta igual filtra por negocio: con el negocio equivocado no hay menú propio.
    const ajeno = await modulosDe({ user: otro, staff: vigilante });
    expect(ajeno.find((m) => m.key === "marcar")?.visible ?? false).toBe(false);
  });

  it("el dueño siempre puede todo", async () => {
    expect(await puedeUsar({ user, staff: dueno }, "ventas")).toBe(true);
  });
});
