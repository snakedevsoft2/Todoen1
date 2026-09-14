"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, requireSession } from "@/lib/auth";
import { cambiarSeguimiento, guardarConsentimiento } from "@/lib/ubicacion";

/** La persona acepta, o retira, compartir su ubicacion durante la jornada. */
export async function consentimientoUbicacionAction(acepta: boolean): Promise<{ ok: true }> {
  const { staff } = await requireSession();
  await guardarConsentimiento(staff.id, acepta === true);
  revalidatePath("/panel/marcar");
  revalidatePath("/panel/planilla");
  return { ok: true };
}

/** El dueño activa o apaga el pedido de ubicación para todo el personal. */
export async function seguimientoAction(activo: boolean): Promise<{ ok: true }> {
  const { user } = await requireOwner();
  await cambiarSeguimiento(user.id, activo === true);
  revalidatePath("/panel/planilla");
  revalidatePath("/panel/marcar");
  return { ok: true };
}
