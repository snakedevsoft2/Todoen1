"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { crudo, str } from "@/lib/format";

export type PerfilState = { error?: string; ok?: string } | undefined;

const FOTO_VALIDA = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;
/** El telefono la achica a unos 150 KB; esto es el tope del servidor. */
const MAX_LARGO_FOTO = 300_000;

/**
 * Cada quien edita su propio perfil: nombre, telefono y foto.
 *
 * Siempre sobre la persona de la sesion: nadie cambia el perfil de otro desde
 * aqui. El administrador cambia los datos de su gente desde Personal.
 */
export async function guardarPerfilAction(_prev: PerfilState, formData: FormData): Promise<PerfilState> {
  const { user, staff } = await requireSession({ asistenciaOk: true });

  const name = str(formData.get("name"), "", 80);
  if (name.length < 2) return { error: "Escribe tu nombre." };
  const phone = str(formData.get("phone"), "", 40) || null;

  const fotoIn = crudo(formData.get("photo"));
  let photo: string | null | undefined;
  if (fotoIn === "__borrar__") {
    photo = null;
  } else if (fotoIn) {
    if (!FOTO_VALIDA.test(fotoIn)) return { error: "La foto debe ser una imagen PNG, JPG o WEBP." };
    if (fotoIn.length > MAX_LARGO_FOTO) return { error: "La foto pesa demasiado. Prueba con otra." };
    photo = fotoIn;
  }

  await db.staff.update({
    where: { id: staff.id },
    data: { name, phone, ...(photo !== undefined ? { photo } : {}) },
  });
  // El nombre del dueño tambien vive en la cuenta: que no queden dos distintos.
  if (staff.role === "DUENO") {
    await db.user.update({ where: { id: user.id }, data: { ownerName: name } });
  }

  revalidatePath("/panel", "layout");
  return { ok: "Tu perfil quedó guardado." };
}
