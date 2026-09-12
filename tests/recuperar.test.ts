import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  buscarCuenta,
  crearEnlace,
  excedioElLimite,
  huella,
  pedidosRecientes,
  revisarEnlace,
} from "../src/lib/reset";

/**
 * Reponer la contrasena olvidada.
 *
 * Es la unica puerta de la aplicacion que se abre sin saber la contrasena, asi
 * que aqui quedan fijadas las reglas que impiden que se vuelva una entrada
 * libre:
 *
 *   1. El token no se guarda: en la base solo vive su huella.
 *   2. Un enlace sirve una sola vez, y pedir otro tumba el anterior.
 *   3. Un enlace vencido no vale, aunque nadie lo haya usado.
 *   4. Un enlace es de una cuenta y no alcanza a la de al lado.
 *   5. El barbero desactivado no recibe enlace: si no entra, no hay que
 *      reponerle nada.
 */
const db = new PrismaClient();

const SUFIJO = "reset-" + Date.now();
const correo = (n: string) => n + "-" + SUFIJO + "@test.local";

let negocio: { id: string; email: string };
let otroNegocio: { id: string; email: string };
let barbero: { id: string; email: string };
let apagado: { id: string; email: string };

beforeAll(async () => {
  const uno = await db.user.create({
    data: {
      email: correo("duena"),
      passwordHash: bcrypt.hashSync("laDeAntes", 10),
      ownerName: "Duena Uno",
      businessName: "Barberia " + SUFIJO,
      businessType: "BARBERIA",
      slug: "barberia-" + SUFIJO,
      staff: {
        create: [
          {
            name: "Barbero",
            email: correo("barbero"),
            passwordHash: bcrypt.hashSync("laDeAntes", 10),
            role: "BARBERO",
          },
          {
            name: "Apagado",
            email: correo("apagado"),
            passwordHash: bcrypt.hashSync("laDeAntes", 10),
            role: "BARBERO",
            active: false,
          },
        ],
      },
    },
    include: { staff: true },
  });

  const dos = await db.user.create({
    data: {
      email: correo("vecina"),
      passwordHash: bcrypt.hashSync("laDeAntes", 10),
      ownerName: "Duena Dos",
      businessName: "Vecina " + SUFIJO,
      businessType: "ROPA",
      slug: "vecina-" + SUFIJO,
    },
  });

  negocio = { id: uno.id, email: uno.email };
  otroNegocio = { id: dos.id, email: dos.email };
  const b = uno.staff.find((s) => s.name === "Barbero")!;
  const a = uno.staff.find((s) => s.name === "Apagado")!;
  barbero = { id: b.id, email: b.email! };
  apagado = { id: a.id, email: a.email! };
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [negocio.id, otroNegocio.id] } } });
  await db.$disconnect();
});

describe("a quien le pertenece un correo", () => {
  it("encuentra al dueno del negocio", async () => {
    const destino = await buscarCuenta(negocio.email);
    expect(destino?.tipo).toBe("negocio");
    expect(destino?.id).toBe(negocio.id);
  });

  it("encuentra al barbero con usuario propio", async () => {
    const destino = await buscarCuenta(barbero.email);
    expect(destino?.tipo).toBe("persona");
    expect(destino?.id).toBe(barbero.id);
  });

  it("no le manda enlace al barbero desactivado", async () => {
    expect(await buscarCuenta(apagado.email)).toBeNull();
  });

  it("no encuentra nada con un correo que no existe", async () => {
    expect(await buscarCuenta(correo("fantasma"))).toBeNull();
  });

  it("no le importan las mayusculas ni los espacios", async () => {
    const destino = await buscarCuenta("  " + negocio.email.toUpperCase() + " ");
    expect(destino?.id).toBe(negocio.id);
  });
});

describe("el enlace", () => {
  it("no queda guardado en la base, solo su huella", async () => {
    const destino = (await buscarCuenta(negocio.email))!;
    const token = await crearEnlace(destino);

    const guardado = await db.passwordReset.findUnique({ where: { tokenHash: huella(token) } });
    expect(guardado).not.toBeNull();
    expect(guardado!.tokenHash).not.toBe(token);

    // Y no hay ninguna fila que tenga el token tal cual en ningun campo.
    const enClaro = await db.passwordReset.findMany({ where: { tokenHash: token } });
    expect(enClaro).toHaveLength(0);
  });

  it("sirve mientras este fresco", async () => {
    const destino = (await buscarCuenta(barbero.email))!;
    const token = await crearEnlace(destino);
    const revision = await revisarEnlace(token);
    expect(revision.ok).toBe(true);
  });

  it("deja de servir despues de usarse", async () => {
    const destino = (await buscarCuenta(barbero.email))!;
    const token = await crearEnlace(destino);

    const antes = await revisarEnlace(token);
    expect(antes.ok).toBe(true);
    if (!antes.ok) return;

    await db.passwordReset.update({
      where: { id: antes.enlace.id },
      data: { usedAt: new Date() },
    });

    const despues = await revisarEnlace(token);
    expect(despues.ok).toBe(false);
    if (!despues.ok) expect(despues.motivo).toBe("usado");
  });

  it("no vale si ya se vencio, aunque nadie lo haya usado", async () => {
    const destino = (await buscarCuenta(negocio.email))!;
    const token = await crearEnlace(destino);

    await db.passwordReset.update({
      where: { tokenHash: huella(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const revision = await revisarEnlace(token);
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.motivo).toBe("vencido");
  });

  it("pedir uno nuevo tumba el anterior", async () => {
    const destino = (await buscarCuenta(negocio.email))!;
    const viejo = await crearEnlace(destino);
    const nuevo = await crearEnlace(destino);

    const revisionVieja = await revisarEnlace(viejo);
    expect(revisionVieja.ok).toBe(false);
    if (!revisionVieja.ok) expect(revisionVieja.motivo).toBe("usado");

    expect((await revisarEnlace(nuevo)).ok).toBe(true);
  });

  it("un token inventado no abre nada", async () => {
    const revision = await revisarEnlace("esto-no-es-un-token");
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.motivo).toBe("inexistente");
  });

  it("el enlace de un negocio no apunta al de al lado", async () => {
    const destino = (await buscarCuenta(negocio.email))!;
    const token = await crearEnlace(destino);
    const revision = await revisarEnlace(token);

    expect(revision.ok).toBe(true);
    if (!revision.ok) return;
    expect(revision.enlace.userId).toBe(negocio.id);
    expect(revision.enlace.userId).not.toBe(otroNegocio.id);
    expect(revision.enlace.staffId).toBeNull();
  });

  it("el del barbero queda a su nombre y no al del negocio", async () => {
    const destino = (await buscarCuenta(barbero.email))!;
    const token = await crearEnlace(destino);
    const revision = await revisarEnlace(token);

    expect(revision.ok).toBe(true);
    if (!revision.ok) return;
    expect(revision.enlace.staffId).toBe(barbero.id);
    expect(revision.enlace.userId).toBeNull();
  });
});

describe("el freno a los pedidos seguidos", () => {
  it("cuenta los del mismo correo y corta al pasarse", async () => {
    const suyo = correo("insistente");
    expect(excedioElLimite(await pedidosRecientes(suyo))).toBe(false);

    // Se cuentan por correo aunque no haya cuenta detras: es lo que evita que
    // alguien use la pantalla publica para llenarle el buzon a otro.
    for (let i = 0; i < 3; i += 1) {
      await db.passwordReset.create({
        data: {
          tokenHash: huella("token-" + i + "-" + SUFIJO),
          email: suyo,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
    }

    expect(excedioElLimite(await pedidosRecientes(suyo))).toBe(true);
    // Y no le estorba a los demas.
    expect(excedioElLimite(await pedidosRecientes(correo("tranquilo")))).toBe(false);

    await db.passwordReset.deleteMany({ where: { email: suyo } });
  });
});
