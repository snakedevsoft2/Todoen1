import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { eliminarPersona } from "../src/lib/eliminar-persona";
import { getStaffTotals } from "../src/lib/queries";
import { EX_COLABORADOR } from "../src/lib/staff";

/**
 * Eliminar a alguien del equipo: la persona desaparece (no entra, no sale en
 * Equipo, su correo queda libre), pero sus registros se quedan y la nombran
 * como "Ex colaborador".
 */
const db = new PrismaClient();
const S = "excol-" + Date.now();
let userId: string;
let jhonId: string;
let duenoId: string;
let saleId: string;
let marcaId: string;

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: "fer-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Fer",
      businessName: "Lavadero " + S,
      businessType: "LAVADERO",
      slug: "lav-" + S,
      staff: {
        create: [
          { name: "Fer", role: "DUENO" },
          { name: "Jhon", role: "VENDEDOR", email: "jhon-" + S + "@test.local", username: "jhon" + Date.now(), passwordHash: "h", phone: "300", commissionPct: 40 },
        ],
      },
    },
    include: { staff: true },
  });
  userId = user.id;
  jhonId = user.staff.find((s) => s.name === "Jhon")!.id;
  duenoId = user.staff.find((s) => s.role === "DUENO")!.id;
  saleId = (await db.sale.create({ data: { userId, day: "2026-10-15", total: 25000, paymentMethod: "EFECTIVO", staffId: jhonId } })).id;
  marcaId = (await db.attendance.create({ data: { userId, staffId: jhonId, kind: "ENTRADA", markedAt: new Date(), clientKey: "marca-" + S } })).id;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

describe("eliminar a alguien del equipo", () => {
  it("queda como Ex colaborador, sin datos ni acceso, y sus registros siguen", async () => {
    const antes = await db.staff.findUniqueOrThrow({ where: { id: jhonId } });
    expect(await eliminarPersona(userId, jhonId)).toEqual({ name: "Jhon" });

    const despues = await db.staff.findUniqueOrThrow({ where: { id: jhonId } });
    expect(despues).toMatchObject({
      name: EX_COLABORADOR,
      active: false,
      email: null,
      username: null,
      passwordHash: null,
      phone: null,
      commissionPct: 40,
    });
    expect(despues.deletedAt).not.toBeNull();
    expect(despues.sessionVersion).toBe(antes.sessionVersion + 1);

    // La venta y el marcaje siguen, y la nombran como Ex colaborador.
    const venta = await db.sale.findUniqueOrThrow({ where: { id: saleId }, include: { staff: { select: { name: true } } } });
    expect(venta.staff?.name).toBe(EX_COLABORADOR);
    expect(await db.attendance.findUnique({ where: { id: marcaId } })).not.toBeNull();
  });

  it("su correo queda libre y no se puede eliminar dos veces, ni al dueño", async () => {
    expect(await db.staff.findUnique({ where: { email: "jhon-" + S + "@test.local" } })).toBeNull();
    expect(await eliminarPersona(userId, jhonId)).toBeNull();
    expect(await eliminarPersona(userId, duenoId)).toBeNull();
  });

  it("en la medición por persona sale como Ex colaborador solo si tuvo movimiento", async () => {
    const conVentas = await getStaffTotals(userId, "2026-10-15", "2026-10-15");
    expect(conVentas.rows.find((r) => r.staffId === jhonId)?.name).toBe(EX_COLABORADOR);
    const sinVentas = await getStaffTotals(userId, "2026-10-16", "2026-10-16");
    expect(sinVentas.rows.find((r) => r.staffId === jhonId)).toBeUndefined();
  });
});
