import { db } from "./db";
import { checkPassword, hashPassword } from "./auth";
import { APP_NAME } from "./brand";
import { SUPPORT_WHATSAPP_PRETTY } from "./support";
import { normalizarRespuesta, preguntaFalsa } from "./preguntas";

/**
 * Recuperar la clave con la pregunta de seguridad.
 *
 * Es la puerta que funciona sin correo. Por eso mismo es la mas facil de
 * forzar: una respuesta como el nombre de una mascota tiene pocas opciones.
 * Lo que la sostiene:
 *
 *   - Freno de intentos por correo: 5 fallos en 15 minutos o 15 en un dia
 *     bloquean, aunque despues llegue la respuesta correcta.
 *   - Nada delata si el correo existe: el que no existe recibe una pregunta
 *     igual de creible, y tarda lo mismo en fallar.
 *   - Al cambiar la clave se tumban los enlaces de recuperacion que estuvieran
 *     vivos, y si hay correo configurado se avisa del cambio.
 */

const FALLOS_CORTO = 5;
const MINUTOS_CORTO = 15;
const FALLOS_DIA = 15;

export type CuentaConPregunta = {
  tipo: "negocio" | "persona";
  id: string;
  email: string;
  nombre: string;
  pregunta: string | null;
  hash: string | null;
};

/** Mismo orden que el ingreso: primero el negocio, despues el personal. */
export async function buscarCuentaParaPregunta(email: string): Promise<CuentaConPregunta | null> {
  const correo = email.trim().toLowerCase();
  if (!correo) return null;

  const negocio = await db.user.findUnique({
    where: { email: correo },
    select: { id: true, email: true, ownerName: true, securityQuestion: true, securityAnswerHash: true },
  });
  if (negocio) {
    return {
      tipo: "negocio",
      id: negocio.id,
      email: negocio.email,
      nombre: negocio.ownerName,
      pregunta: negocio.securityQuestion,
      hash: negocio.securityAnswerHash,
    };
  }

  const persona = await db.staff.findUnique({
    where: { email: correo },
    select: {
      id: true,
      email: true,
      name: true,
      active: true,
      passwordHash: true,
      securityQuestion: true,
      securityAnswerHash: true,
    },
  });
  // Desactivado o sin usuario: no hay clave que reponer.
  if (!persona || !persona.active || !persona.passwordHash || !persona.email) return null;

  return {
    tipo: "persona",
    id: persona.id,
    email: persona.email,
    nombre: persona.name,
    pregunta: persona.securityQuestion,
    hash: persona.securityAnswerHash,
  };
}

/** La pregunta que se le muestra a ese correo: la suya, o una inventada. */
export async function preguntaPara(email: string): Promise<string> {
  const cuenta = await buscarCuentaParaPregunta(email);
  return cuenta?.pregunta && cuenta.hash ? cuenta.pregunta : preguntaFalsa(email);
}

export async function estaBloqueado(email: string): Promise<boolean> {
  const correo = email.trim().toLowerCase();
  const ahora = Date.now();
  const [corto, dia] = await Promise.all([
    db.securityAttempt.count({
      where: { email: correo, success: false, createdAt: { gte: new Date(ahora - MINUTOS_CORTO * 60000) } },
    }),
    db.securityAttempt.count({
      where: { email: correo, success: false, createdAt: { gte: new Date(ahora - 24 * 3600000) } },
    }),
  ]);
  return corto >= FALLOS_CORTO || dia >= FALLOS_DIA;
}

/**
 * Un hash cualquiera para comparar cuando la cuenta no existe.
 *
 * Comparar contra bcrypt tarda unos 70 ms. Si al correo inexistente se le
 * respondiera al instante, el tiempo de respuesta delataria cuales existen.
 */
let hashDeRelleno: string | null = null;
function relleno(): string {
  if (!hashDeRelleno) hashDeRelleno = hashPassword("relleno-" + Math.random());
  return hashDeRelleno;
}

export type ResultadoRecuperacion =
  | { ok: true; cuenta: CuentaConPregunta }
  | { ok: false; error: string };

export async function intentarRecuperar(
  email: string,
  respuesta: string,
  nuevaClave: string
): Promise<ResultadoRecuperacion> {
  const correo = email.trim().toLowerCase();

  if (await estaBloqueado(correo)) {
    return {
      ok: false,
      error:
        "Hubo demasiados intentos con este correo. Espera un rato o escríbenos al " +
        SUPPORT_WHATSAPP_PRETTY +
        ".",
    };
  }

  const cuenta = await buscarCuentaParaPregunta(correo);
  const normalizada = normalizarRespuesta(respuesta);
  const acierta =
    cuenta?.hash && normalizada
      ? checkPassword(normalizada, cuenta.hash)
      : (checkPassword(normalizada || "x", relleno()), false);

  await db.securityAttempt.create({ data: { email: correo, success: Boolean(acierta && cuenta) } });

  if (!acierta || !cuenta) return { ok: false, error: "La respuesta no coincide." };

  const passwordHash = hashPassword(nuevaClave);
  await db.$transaction([
    cuenta.tipo === "negocio"
      ? db.user.update({ where: { id: cuenta.id }, data: { passwordHash } })
      : db.staff.update({ where: { id: cuenta.id }, data: { passwordHash } }),
    // Si habia un enlace de recuperacion vivo, ya no debe servir: la clave
    // acaba de cambiar por otro camino.
    db.passwordReset.updateMany({
      where:
        cuenta.tipo === "negocio"
          ? { userId: cuenta.id, usedAt: null }
          : { staffId: cuenta.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true, cuenta };
}

/** El aviso que sale por correo cuando la clave se cambio con la pregunta. */
export function correoAvisoCambio(nombre: string) {
  const texto = [
    "Hola " + nombre + ",",
    "",
    "La contraseña de tu cuenta de " + APP_NAME + " se cambió respondiendo tu pregunta de seguridad.",
    "",
    "Si fuiste tú, no tienes que hacer nada.",
    "Si NO fuiste tú, escríbenos ya al " + SUPPORT_WHATSAPP_PRETTY + ": alguien conoce tu respuesta.",
  ].join("\n");

  return {
    subject: "Tu contraseña de " + APP_NAME + " cambió",
    text: texto,
    html:
      '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">' +
      texto
        .split("\n")
        .map((l) => (l ? "<p style=\"margin:0 0 8px\">" + l.replace(/</g, "&lt;") + "</p>" : ""))
        .join("") +
      "</div>",
  };
}
