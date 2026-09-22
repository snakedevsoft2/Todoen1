import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { anotarIntentoDeLogin, demasiadosIntentosDeLogin } from "../src/lib/seguridad";
import { signSession, verifySession } from "../src/lib/session";

/**
 * Dos cosas que la auditoria de seguridad encontro sin cubrir:
 *
 *   1. El ingreso con correo y clave no tenia freno de intentos (a
 *      diferencia del ingreso por usuario, que si lo tenia).
 *   2. Cambiar la contrasena no invalidaba las sesiones ya abiertas.
 *
 * Aqui se prueban los dos mecanismos que las cierran.
 */
const db = new PrismaClient();
const S = "login-seg-" + Date.now();

afterAll(async () => {
  await db.securityAttempt.deleteMany({ where: { email: { contains: S } } });
  await db.$disconnect();
});

describe("freno de intentos del login con correo y clave", () => {
  it("bloquea tras diez fallos seguidos desde el mismo origen", async () => {
    const origen = S + "-ip-a";
    expect(await demasiadosIntentosDeLogin(origen)).toBe(false);
    for (let i = 0; i < 10; i += 1) await anotarIntentoDeLogin(origen);
    expect(await demasiadosIntentosDeLogin(origen)).toBe(true);
  });

  it("el bloqueo es por origen: no le estorba a otra conexion", async () => {
    expect(await demasiadosIntentosDeLogin(S + "-ip-b")).toBe(false);
  });
});

describe("version de sesion en el token (uv/sv)", () => {
  it("firma y verifica trayendo uv y sv intactos", async () => {
    const token = await signSession({
      uid: "u1",
      email: "x@test.local",
      type: "OTRO",
      sid: "s1",
      role: "DUENO",
      uv: 3,
      sv: 1,
    });
    const payload = await verifySession(token);
    expect(payload?.uv).toBe(3);
    expect(payload?.sv).toBe(1);
  });

  it("una sesion firmada antes de este campo no trae uv/sv (no se debe tratar como invalida)", async () => {
    const token = await signSession({
      uid: "u1",
      email: "x@test.local",
      type: "OTRO",
      sid: "s1",
      role: "DUENO",
    });
    const payload = await verifySession(token);
    expect(payload?.uv).toBeUndefined();
    expect(payload?.sv).toBeUndefined();
  });
});
