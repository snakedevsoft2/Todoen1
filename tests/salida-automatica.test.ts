import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  anularAutomaticaAlLlegarLaReal,
  cerrarSalidasOlvidadas,
  finDelDia,
} from "../src/lib/salida-automatica";
import { motivoParaRechazar } from "../src/lib/jornada-reglas";

/**
 * Quien marco entrada y no marco salida: al cambiar el dia la aplicacion le
 * pone la salida a las 11:59:59 p. m. Solo en el lavadero.
 */
const db = new PrismaClient();
const S = "salida-" + Date.now();
const TZ = "America/Bogota";

let lavadero: { id: string; timezone: string; businessType: string };
let asistencia: { id: string; timezone: string; businessType: string };
let andrea: string;
let pedro: string;
let juan: string;

// 28 de septiembre, 7:42 a. m. en Bogota (UTC-5).
const ENTRADA_AYER = new Date("2026-09-28T12:42:00Z");
// 29 de septiembre, 8:00 a. m. en Bogota.
const AHORA = new Date("2026-09-29T13:00:00Z");

async function negocio(tipo: "LAVADERO" | "ASISTENCIA", nombre: string) {
  return db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: nombre,
      businessName: nombre + " " + S,
      businessType: tipo,
      slug: nombre + "-" + S,
      timezone: TZ,
      staff: { create: [{ name: "Dueño", role: "DUENO" }, { name: nombre + " 1", role: "VENDEDOR" }, { name: nombre + " 2", role: "VENDEDOR" }] },
    },
    include: { staff: true },
  });
}

beforeAll(async () => {
  const l = await negocio("LAVADERO", "lav");
  const a = await negocio("ASISTENCIA", "asi");
  lavadero = l;
  asistencia = a;
  andrea = l.staff.find((s) => s.name === "lav 1")!.id;
  pedro = l.staff.find((s) => s.name === "lav 2")!.id;
  juan = a.staff.find((s) => s.name === "asi 1")!.id;

  await db.attendance.createMany({
    data: [
      // Andrea entro y no marco salida.
      { userId: l.id, staffId: andrea, kind: "ENTRADA", markedAt: ENTRADA_AYER, clientKey: "a1-" + S },
      // Pedro entro y si salio.
      { userId: l.id, staffId: pedro, kind: "ENTRADA", markedAt: ENTRADA_AYER, clientKey: "p1-" + S },
      { userId: l.id, staffId: pedro, kind: "SALIDA", markedAt: new Date("2026-09-28T23:00:00Z"), clientKey: "p2-" + S },
      // Juan, del gestor de asistencia, tampoco marco: ahi no se cierra solo.
      { userId: a.id, staffId: juan, kind: "ENTRADA", markedAt: ENTRADA_AYER, clientKey: "j1-" + S },
    ],
  });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

describe("salida automática", () => {
  it("al cambiar el día le pone la salida a quien no la marcó, a las 11:59:59 p. m.", async () => {
    expect(await cerrarSalidasOlvidadas(lavadero, AHORA)).toBe(1);
    const salida = await db.attendance.findFirst({ where: { staffId: andrea, kind: "SALIDA" } });
    expect(salida?.automatic).toBe(true);
    expect(salida?.markedAt.toISOString()).toBe(finDelDia("2026-09-28", TZ).toISOString());
    expect(salida?.markedAt.toISOString()).toBe("2026-09-29T04:59:59.000Z");
    // Pedro ya tenía su salida.
    expect(await db.attendance.count({ where: { staffId: pedro, kind: "SALIDA" } })).toBe(1);
  });

  it("correrlo otra vez no pone otra salida", async () => {
    expect(await cerrarSalidasOlvidadas(lavadero, AHORA)).toBe(0);
    expect(await db.attendance.count({ where: { staffId: andrea, kind: "SALIDA" } })).toBe(1);
  });

  it("no toca la entrada de hoy: esa todavía puede marcar su salida", async () => {
    await db.attendance.create({
      data: { userId: lavadero.id, staffId: pedro, kind: "ENTRADA", markedAt: new Date("2026-09-29T12:30:00Z"), clientKey: "p3-" + S },
    });
    expect(await cerrarSalidasOlvidadas(lavadero, AHORA)).toBe(0);
  });

  it("en el gestor de asistencia no se cierra solo (turnos de noche)", async () => {
    expect(await cerrarSalidasOlvidadas(asistencia, AHORA)).toBe(0);
  });

  it("si llega la salida que sí marcó (sin señal), se acepta y la automática se anula", async () => {
    const real = new Date("2026-09-28T22:15:00Z");
    expect(await motivoParaRechazar(andrea, TZ, "SALIDA", new Date("2026-09-29T05:30:00Z"))).toBeNull();
    await db.attendance.create({
      data: { userId: lavadero.id, staffId: andrea, kind: "SALIDA", markedAt: real, clientKey: "a2-" + S },
    });
    expect(await anularAutomaticaAlLlegarLaReal(andrea, real)).toBe(1);
    const auto = await db.attendance.findFirst({ where: { staffId: andrea, automatic: true } });
    expect(auto?.voidedAt).not.toBeNull();
  });
});
