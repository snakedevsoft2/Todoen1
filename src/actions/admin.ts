"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { str } from "@/lib/format";
import { mailEnabled, sendMail } from "@/lib/mail";
import { correoDeEnlace, crearEnlace, direccionBase, type Destino } from "@/lib/reset";

export type AdminState = { error?: string; ok?: string } | undefined;

/**
 * Lo que devuelve reponer la clave. Lleva el enlace porque el administrador
 * tiene que poder copiarlo aunque el correo no haya salido.
 */
export type ReponerState =
  | { error?: string; ok?: string; enlace?: string; correo?: string; enviado?: boolean }
  | undefined;

function refrescar(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/" + id);
  // El menu de esa cuenta cambia, asi que su panel tiene que volver a pintarse.
  revalidatePath("/panel", "layout");
}

/**
 * Prende o apaga un apartado para UNA cuenta.
 *
 * "sin_tocar" borra la excepcion y la cuenta vuelve a lo que le toca por su
 * oficio. Es importante que se pueda deshacer: una excepcion olvidada es una
 * cuenta a la que le falta algo y nadie se acuerda de por que.
 */
export async function setAccountModuleAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const userId = str(formData.get("userId"));
  const moduleKey = str(formData.get("moduleKey"));
  const valor = str(formData.get("valor"));
  const note = str(formData.get("note")) || null;

  const cuenta = await db.user.findUnique({ where: { id: userId }, select: { businessType: true } });
  if (!cuenta) return;

  // El apartado tiene que existir para ese oficio. Sin esto, el administrador
  // podria prenderle turnos a un restaurante desde aqui y romper la regla de
  // que la agenda por hora es de barberia.
  const existe = await db.businessTypeModule.count({
    where: { businessType: cuenta.businessType, moduleKey },
  });
  if (existe === 0) return;

  // Lo fijo no se apaga ni desde aqui: sin Resumen, Ajustes o Soporte la
  // persona queda encerrada y sin manera de pedir ayuda.
  const modulo = await db.module.findUnique({ where: { key: moduleKey }, select: { fixed: true } });
  if (!modulo || modulo.fixed) return;

  if (valor === "sin_tocar") {
    await db.accountModule.deleteMany({ where: { userId, moduleKey } });
  } else {
    const enabled = valor === "prendido";
    await db.accountModule.upsert({
      where: { userId_moduleKey: { userId, moduleKey } },
      create: { userId, moduleKey, enabled, note },
      update: { enabled, note },
    });
  }

  refrescar(userId);
}

/**
 * Suspender una cuenta.
 *
 * No borra nada: cierra la puerta. La sesion que ya estuviera abierta deja de
 * valer en la siguiente pantalla, porque getCurrentSession lo comprueba.
 */
export async function suspendAccountAction(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const admin = await requireAdmin();

  const userId = str(formData.get("userId"));
  const motivo = str(formData.get("reason"));
  if (!motivo) return { error: "Escribe por que la vas a suspender." };

  // Que el administrador no se pueda dejar a si mismo por fuera.
  if (userId === admin.user.id) {
    return { error: "No puedes suspender tu propia cuenta." };
  }

  await db.user.update({
    where: { id: userId },
    data: { suspendedAt: new Date(), suspendedReason: motivo },
  });

  refrescar(userId);
  return { ok: "Cuenta suspendida. Ya no puede entrar." };
}

export async function reactivateAccountAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = str(formData.get("userId"));
  await db.user.update({
    where: { id: userId },
    data: { suspendedAt: null, suspendedReason: null },
  });
  refrescar(userId);
}

/**
 * Quitarle el acceso a una persona dentro de una cuenta.
 *
 * Es mas fino que suspender el negocio entero: sirve cuando el problema es una
 * persona y no el cliente. El dueno lo puede deshacer desde su propio panel,
 * porque ese es su equipo y no nuestro.
 */
export async function toggleStaffAccessAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const staffId = str(formData.get("staffId"));
  const userId = str(formData.get("userId"));

  const persona = await db.staff.findFirst({
    where: { id: staffId, userId },
    select: { id: true, active: true, role: true },
  });
  if (!persona) return;

  // Al dueno de un negocio no se le quita el acceso uno por uno: o se suspende
  // la cuenta entera, o no. Si no, quedaria un negocio sin quien lo administre.
  if (persona.role === "DUENO") return;
  if (userId === admin.user.id) return;

  await db.staff.update({ where: { id: persona.id }, data: { active: !persona.active } });
  refrescar(userId);
}

/**
 * Reponerle la clave a una cuenta desde el panel de la plataforma.
 *
 * Es la salida para cuando el camino normal no alcanza: el correo no llega, se
 * equivocaron al escribirlo, o todavia no hay RESEND_API_KEY configurada.
 *
 * No se le pone una contrasena nueva y se le dicta: se le genera el MISMO
 * enlace de un solo uso que manda la pantalla publica, y la persona escribe la
 * suya. Asi el administrador nunca llega a saber la clave de un cliente, que es
 * como tiene que ser.
 *
 * Se hacen las dos cosas a la vez: se le manda el correo y se le devuelve el
 * enlace al administrador. Si el correo sale, la persona ya lo tiene; si no
 * sale, el administrador se lo pasa por WhatsApp y nadie queda trancado.
 */
export async function reponerClaveAction(
  _prev: ReponerState,
  formData: FormData
): Promise<ReponerState> {
  await requireAdmin();

  const userId = str(formData.get("userId"));
  const staffId = str(formData.get("staffId"));

  const cuenta = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, ownerName: true, suspendedAt: true },
  });
  if (!cuenta) return { error: "Esa cuenta ya no existe." };

  // Una cuenta suspendida no puede entrar, asi que un enlace no le sirve de
  // nada: primero se reactiva. Decirlo es mejor que mandar un correo inutil.
  if (cuenta.suspendedAt) {
    return { error: "La cuenta esta suspendida. Reactivala primero y vuelve a intentarlo." };
  }

  let destino: Destino;

  if (staffId) {
    // El staffId tiene que ser de ESTA cuenta. Sin esta comprobacion, el
    // formulario podria pedir el enlace de alguien de otro negocio.
    const persona = await db.staff.findFirst({
      where: { id: staffId, userId },
      select: { id: true, name: true, email: true, active: true, passwordHash: true },
    });
    if (!persona) return { error: "Esa persona no esta en esta cuenta." };
    if (!persona.email || !persona.passwordHash) {
      return { error: persona.name + " no tiene usuario para entrar, asi que no hay clave que reponer." };
    }
    if (!persona.active) {
      return { error: persona.name + " tiene el acceso quitado. Devuelveselo primero." };
    }
    destino = { tipo: "persona", id: persona.id, nombre: persona.name, email: persona.email };
  } else {
    destino = {
      tipo: "negocio",
      id: cuenta.id,
      nombre: cuenta.ownerName,
      email: cuenta.email,
    };
  }

  const token = await crearEnlace(destino);
  const enlace = (await direccionBase()) + "/recuperar/" + token;

  // Se distingue "no hay correo configurado" de "el correo fallo". Para quien
  // esta atendiendo no es lo mismo: lo primero se arregla poniendo la llave y
  // no vale la pena reintentarlo; lo segundo si.
  const hayCorreo = mailEnabled();
  const enviado = hayCorreo
    ? await sendMail({
        to: destino.email,
        ...correoDeEnlace({ nombre: destino.nombre, url: enlace, porSoporte: true }),
      })
    : false;

  refrescar(userId);

  const aviso = enviado
    ? "Enlace enviado a " + destino.email + "."
    : hayCorreo
      ? "No se pudo mandar el correo. Pasale el enlace por WhatsApp."
      : "El envio de correos no esta configurado (falta RESEND_API_KEY). Pasale el enlace por WhatsApp.";

  return { enlace, correo: destino.email, ok: aviso, enviado };
}
