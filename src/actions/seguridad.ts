"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { checkPassword, hashPassword, requireSession } from "@/lib/auth";
import { str } from "@/lib/format";
import { mailEnabled, sendMail } from "@/lib/mail";
import { MIN_RESPUESTA, normalizarRespuesta, PREGUNTAS } from "@/lib/preguntas";
import { correoAvisoCambio, intentarRecuperar, preguntaPara } from "@/lib/seguridad";

export type SeguridadState = { error?: string; ok?: string } | undefined;
export type PreguntaState = { error?: string; email?: string; pregunta?: string } | undefined;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Guardar o cambiar la pregunta de seguridad.
 *
 * Pide la contrasena actual, y no por tramite: con la sesion abierta en un
 * computador ajeno, alguien podria poner una pregunta cuya respuesta conoce y
 * quedarse con la cuenta despues.
 */
export async function guardarPreguntaAction(
  _prev: SeguridadState,
  formData: FormData
): Promise<SeguridadState> {
  const { user, staff } = await requireSession({ asistenciaOk: true, lavadorOk: true });
  const esDueno = staff.role === "DUENO";

  const actual = String(formData.get("claveActual") ?? "");
  const hashActual = esDueno ? user.passwordHash : staff.passwordHash;
  if (!hashActual || !checkPassword(actual, hashActual)) {
    return { error: "La contraseña actual no coincide." };
  }

  const elegida = str(formData.get("pregunta"));
  const pregunta = elegida === "__otra__" ? str(formData.get("preguntaPropia"), "", 120) : elegida;
  if (!pregunta) return { error: "Escribe la pregunta." };
  if (elegida !== "__otra__" && !PREGUNTAS.includes(pregunta)) return { error: "Elige una pregunta de la lista." };

  const respuesta = normalizarRespuesta(String(formData.get("respuesta") ?? ""));
  if (respuesta.length < MIN_RESPUESTA) {
    return { error: "La respuesta es muy corta. Usa al menos " + MIN_RESPUESTA + " letras." };
  }

  const datos = { securityQuestion: pregunta, securityAnswerHash: hashPassword(respuesta) };
  if (esDueno) await db.user.update({ where: { id: user.id }, data: datos });
  else await db.staff.update({ where: { id: staff.id }, data: datos });

  return { ok: "Pregunta guardada. Ya puedes recuperar tu contraseña con ella." };
}

/** Paso 1: mostrar la pregunta de ese correo (o una inventada si no tiene). */
export async function buscarPreguntaAction(
  _prev: PreguntaState,
  formData: FormData
): Promise<PreguntaState> {
  const email = str(formData.get("email")).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Escribe un correo válido." };
  return { email, pregunta: await preguntaPara(email) };
}

/** Paso 2: responder y poner la clave nueva. */
export async function responderPreguntaAction(
  _prev: SeguridadState,
  formData: FormData
): Promise<SeguridadState> {
  const email = str(formData.get("email")).toLowerCase();
  const respuesta = String(formData.get("respuesta") ?? "");
  const clave = String(formData.get("password") ?? "");
  const confirma = String(formData.get("confirmPassword") ?? "");

  // La clave se valida antes de mirar la respuesta: asi un error de largo no
  // gasta un intento ni dice nada sobre la cuenta.
  if (clave.length < 6) return { error: "La contraseña debe tener al menos 6 caracteres." };
  if (clave !== confirma) return { error: "Las dos contraseñas no coinciden." };

  const r = await intentarRecuperar(email, respuesta, clave);
  if (!r.ok) return { error: r.error };

  if (mailEnabled()) {
    // Si el aviso no sale, el cambio igual quedo hecho: no se le hace esperar.
    void sendMail({ to: r.cuenta.email, ...correoAvisoCambio(r.cuenta.nombre) });
  }

  redirect("/login?cambiada=1");
}
