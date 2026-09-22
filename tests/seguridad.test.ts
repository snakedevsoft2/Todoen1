import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { normalizarRespuesta, PREGUNTAS, preguntaFalsa } from "../src/lib/preguntas";
import { estaBloqueado, intentarRecuperar, preguntaPara } from "../src/lib/seguridad";

/**
 * Recuperar la clave con la pregunta de seguridad.
 *
 * Es la unica forma de cambiar la clave sin sesion y sin correo, asi que aqui
 * se fija lo que impide que se vuelva una puerta abierta: el freno de
 * intentos, que un correo inexistente no se delate, y que la respuesta
 * correcta funcione aunque se escriba distinto.
 */
const db = new PrismaClient();
const S = "seg-" + Date.now();
const correo = (n: string) => n + "-" + S + "@test.local";
const hashResp = (r: string) => bcrypt.hashSync(normalizarRespuesta(r), 10);

let dueno: { id: string; email: string };
let bloqueable: { id: string; email: string };
let apagado: string;
let sinPregunta: string;

beforeAll(async () => {
  const u = await db.user.create({
    data: {
      email: correo("duena"),
      passwordHash: bcrypt.hashSync("laVieja1", 10),
      ownerName: "Duena",
      businessName: "Seg " + S,
      businessType: "OTRO",
      slug: "seg-" + S,
      securityQuestion: PREGUNTAS[0],
      securityAnswerHash: hashResp("Firuláis"),
      staff: {
        create: [
          { name: "Duena", role: "DUENO" },
          {
            name: "Bloqueable",
            email: correo("bloq"),
            passwordHash: bcrypt.hashSync("laVieja1", 10),
            role: "VENDEDOR",
            securityQuestion: PREGUNTAS[1],
            securityAnswerHash: hashResp("Medellin"),
          },
          {
            name: "Apagado",
            email: correo("apagado"),
            passwordHash: bcrypt.hashSync("laVieja1", 10),
            role: "VENDEDOR",
            active: false,
            securityQuestion: PREGUNTAS[2],
            securityAnswerHash: hashResp("Jose"),
          },
          {
            name: "SinPregunta",
            email: correo("sinp"),
            passwordHash: bcrypt.hashSync("laVieja1", 10),
            role: "VENDEDOR",
          },
        ],
      },
    },
    include: { staff: true },
  });
  dueno = { id: u.id, email: u.email };
  const b = u.staff.find((s) => s.name === "Bloqueable")!;
  bloqueable = { id: b.id, email: b.email! };
  apagado = correo("apagado");
  sinPregunta = correo("sinp");
});

afterAll(async () => {
  await db.securityAttempt.deleteMany({ where: { email: { contains: S } } });
  await db.user.deleteMany({ where: { id: dueno.id } });
  await db.$disconnect();
});

describe("normalizar la respuesta", () => {
  it("no importan tildes, mayusculas ni espacios", () => {
    expect(normalizarRespuesta("  Firuláis ")).toBe("firulais");
    expect(normalizarRespuesta("BOGOTÁ")).toBe(normalizarRespuesta("bogota"));
    expect(normalizarRespuesta("San   José")).toBe("san jose");
  });

  it("los signos no cuentan", () => {
    expect(normalizarRespuesta("¡Toby!")).toBe("toby");
  });
});

describe("la pregunta que se muestra", () => {
  it("un correo con pregunta ve la suya", async () => {
    expect(await preguntaPara(dueno.email)).toBe(PREGUNTAS[0]);
  });

  it("un correo que no existe ve una pregunta creible, siempre la misma", async () => {
    const falso = correo("fantasma");
    const a = await preguntaPara(falso);
    const b = await preguntaPara(falso);
    expect(PREGUNTAS).toContain(a);
    expect(a).toBe(b);
    expect(preguntaFalsa(falso)).toBe(a);
  });

  it("una cuenta sin pregunta tampoco se delata", async () => {
    expect(PREGUNTAS).toContain(await preguntaPara(sinPregunta));
  });
});

describe("responder", () => {
  it("una respuesta equivocada no cambia nada y deja constancia", async () => {
    const r = await intentarRecuperar(dueno.email, "Tobías", "otraClave9");
    expect(r.ok).toBe(false);
    const u = await db.user.findUniqueOrThrow({ where: { id: dueno.id } });
    expect(bcrypt.compareSync("laVieja1", u.passwordHash)).toBe(true);
    expect(await db.securityAttempt.count({ where: { email: dueno.email, success: false } })).toBe(1);
  });

  it("la correcta, escrita distinto, cambia la clave y tumba los enlaces vivos", async () => {
    const enlace = await db.passwordReset.create({
      data: {
        tokenHash: "h-" + S,
        email: dueno.email,
        userId: dueno.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    const r = await intentarRecuperar(dueno.email, "  FIRULAIS ", "nuevaClave9");
    expect(r.ok).toBe(true);

    const u = await db.user.findUniqueOrThrow({ where: { id: dueno.id } });
    expect(bcrypt.compareSync("nuevaClave9", u.passwordHash)).toBe(true);
    const e = await db.passwordReset.findUniqueOrThrow({ where: { id: enlace.id } });
    expect(e.usedAt).not.toBeNull();
    // sessionVersion sube: cualquier cookie firmada con la clave vieja deja
    // de servir en la siguiente peticion (ver lib/auth.ts getCurrentSession).
    expect(u.sessionVersion).toBe(1);
  });

  it("un correo que no existe falla igual y tambien cuenta para el freno", async () => {
    const falso = correo("nadie");
    const r = await intentarRecuperar(falso, "lo que sea", "clave999");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("La respuesta no coincide.");
    expect(await db.securityAttempt.count({ where: { email: falso } })).toBe(1);
  });

  it("el empleado desactivado no puede recuperar aunque acierte", async () => {
    const r = await intentarRecuperar(apagado, "Jose", "clave999");
    expect(r.ok).toBe(false);
  });

  it("una cuenta sin pregunta no se puede recuperar por aqui", async () => {
    const r = await intentarRecuperar(sinPregunta, "cualquier", "clave999");
    expect(r.ok).toBe(false);
  });
});

describe("el freno de intentos", () => {
  it("cinco fallos seguidos bloquean, aunque despues llegue la respuesta correcta", async () => {
    for (let i = 0; i < 5; i += 1) {
      await intentarRecuperar(bloqueable.email, "equivocada " + i, "clave999");
    }
    expect(await estaBloqueado(bloqueable.email)).toBe(true);

    const r = await intentarRecuperar(bloqueable.email, "Medellín", "clave999");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/demasiados intentos/i);

    const s = await db.staff.findUniqueOrThrow({ where: { id: bloqueable.id } });
    expect(bcrypt.compareSync("laVieja1", s.passwordHash!)).toBe(true);
  });

  it("el bloqueo es por correo: no le estorba a los demas", async () => {
    expect(await estaBloqueado(correo("otro-distinto"))).toBe(false);
  });
});
