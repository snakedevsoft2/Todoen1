"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { mailEnabled, sendMail } from "@/lib/mail";
import {
  buscarCuenta,
  correoDeEnlace,
  crearEnlace,
  direccionBase,
  excedioElLimite,
  MINIMO_CLAVE,
  MINUTOS_DE_VIDA,
  pedidosRecientes,
  revisarEnlace,
  TEXTO_INVALIDO,
} from "@/lib/reset";

export type RecuperarState = { error?: string; ok?: string } | undefined;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Lo mismo se responde exista o no la cuenta.
 *
 * Si dijeramos "ese correo no esta registrado", cualquiera podria averiguar
 * desde una pantalla publica quien tiene cuenta y quien no. Asi el que si la
 * tiene recibe su enlace y el que no, no se entera de nada.
 */
const RESPUESTA_UNICA =
  "Si ese correo tiene una cuenta, ya te mandamos el enlace. Revisa tu bandeja de entrada y la carpeta de spam. El enlace se vence en " +
  MINUTOS_DE_VIDA +
  " minutos.";

/** Paso 1: pedir el enlace. */
export async function pedirEnlaceAction(
  _prev: RecuperarState,
  formData: FormData
): Promise<RecuperarState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_RE.test(email)) return { error: "Escribe un correo válido." };

  // Sin servicio de correo no hay forma de mandar nada, y prometerlo seria
  // mentir. La pantalla ni siquiera deberia estar disponible en ese caso.
  if (!mailEnabled()) {
    return {
      error:
        "El envío de correos no está configurado. Escríbenos por WhatsApp y te ayudamos a entrar.",
    };
  }

  if (excedioElLimite(await pedidosRecientes(email))) {
    return {
      error:
        "Ya pediste varios enlaces seguidos. Espera unos minutos y revisa tu correo: el último que te llegó es el que sirve.",
    };
  }

  const destino = await buscarCuenta(email);
  // Correo sin cuenta: se responde lo mismo y no se manda nada.
  if (!destino) return { ok: RESPUESTA_UNICA };

  const token = await crearEnlace(destino);
  const url = (await direccionBase()) + "/recuperar/" + token;
  const enviado = await sendMail({
    to: destino.email,
    ...correoDeEnlace({ nombre: destino.nombre, url }),
  });

  // Si el correo no salio hay que decirlo: la persona se quedaria esperando
  // un mensaje que nunca va a llegar.
  if (!enviado) {
    return {
      error: "No pudimos mandar el correo en este momento. Inténtalo otra vez en un minuto.",
    };
  }

  return { ok: RESPUESTA_UNICA };
}

/**
 * Paso 2: poner la contrasena nueva con el enlace en la mano.
 *
 * El enlace se marca usado en la misma operacion en que se cambia la clave,
 * para que no quede sirviendo si algo falla a mitad de camino.
 */
export async function cambiarConEnlaceAction(
  _prev: RecuperarState,
  formData: FormData
): Promise<RecuperarState> {
  const token = String(formData.get("token") ?? "");
  const clave = String(formData.get("password") ?? "");
  const confirma = String(formData.get("confirmPassword") ?? "");

  if (clave.length < MINIMO_CLAVE) {
    return { error: "La contraseña debe tener al menos " + MINIMO_CLAVE + " caracteres." };
  }
  if (clave !== confirma) return { error: "Las dos contraseñas no coinciden." };

  // Se vuelve a revisar aqui y no solo al abrir la pagina: entre que se abrio
  // el formulario y se envio pudo vencerse o usarse en otra pestana.
  const revision = await revisarEnlace(token);
  if (!revision.ok) return { error: TEXTO_INVALIDO[revision.motivo] };

  const enlace = revision.enlace;
  const passwordHash = hashPassword(clave);

  await db.$transaction(async (tx) => {
    if (enlace.userId) {
      await tx.user.update({ where: { id: enlace.userId }, data: { passwordHash } });
    } else if (enlace.staffId) {
      await tx.staff.update({ where: { id: enlace.staffId }, data: { passwordHash } });
    }
    await tx.passwordReset.update({
      where: { id: enlace.id },
      data: { usedAt: new Date() },
    });
  });

  // No se le abre la sesion sola: entrar con la clave nueva es la forma de que
  // quede seguro de cual puso.
  redirect("/login?cambiada=1");
}
