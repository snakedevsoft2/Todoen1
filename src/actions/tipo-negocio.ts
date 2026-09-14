"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { requireAdmin } from "@/lib/admin";
import { str } from "@/lib/format";
import { BUSINESS_LABEL } from "@/lib/nav";
import { cambiarTipoDeNegocio } from "@/lib/tipo-negocio";

export type CambioTipoState = { error?: string; ok?: string } | undefined;

/**
 * El dueño cambia el tipo de su negocio desde Ajustes.
 *
 * Pide confirmar con la casilla: cambia el menu de todo el equipo. Al terminar
 * lo lleva a la bienvenida, para que arme el menu del oficio nuevo.
 */
export async function cambiarMiTipoAction(_prev: CambioTipoState, formData: FormData): Promise<CambioTipoState> {
  const { user } = await requireOwner();
  if (formData.get("confirmo") !== "on") return { error: "Marca la casilla para confirmar el cambio." };

  const r = await cambiarTipoDeNegocio(user.id, str(formData.get("businessType")));
  if (!r.ok) return { error: r.error };
  if (!r.cambio) return { ok: "Tu negocio ya es de ese tipo." };

  revalidatePath("/panel", "layout");
  redirect("/panel/bienvenida");
}

/** Lo mismo desde el panel de la plataforma, para soporte. */
export async function cambiarTipoAdminAction(_prev: CambioTipoState, formData: FormData): Promise<CambioTipoState> {
  await requireAdmin();
  const userId = str(formData.get("userId"));
  const nuevo = str(formData.get("businessType"));
  if (formData.get("confirmo") !== "on") return { error: "Marca la casilla para confirmar el cambio." };

  const r = await cambiarTipoDeNegocio(userId, nuevo);
  if (!r.ok) return { error: r.error };

  revalidatePath("/admin");
  revalidatePath("/admin/" + userId);
  revalidatePath("/panel", "layout");
  return r.cambio
    ? { ok: "Listo: ahora es " + BUSINESS_LABEL[nuevo as keyof typeof BUSINESS_LABEL] + ". Al entrar verá la bienvenida para armar su menú." }
    : { ok: "Ya era de ese tipo." };
}
