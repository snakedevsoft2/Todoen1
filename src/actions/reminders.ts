"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { str } from "@/lib/format";

/**
 * Marca un recordatorio como enviado.
 *
 * Con el proveedor "enlace" (que es lo que usa casi todo el mundo) WhatsApp lo
 * manda la persona con un toque, asi que la aplicacion no puede saber sola si
 * salio: por eso lo confirma el barbero. Con CallMeBot o Meta lo marca sola la
 * tarea automatica.
 */
export async function markReminderSentAction(formData: FormData) {
  const { user } = await requireSession();
  const id = str(formData.get("id"));

  await db.appointment.updateMany({
    where: { id, userId: user.id },
    data: { reminderSentAt: new Date() },
  });

  revalidatePath("/panel/turnos");
  revalidatePath("/panel");
}

/** Deshacer, por si lo marco sin querer. */
export async function undoReminderSentAction(formData: FormData) {
  const { user } = await requireSession();
  const id = str(formData.get("id"));

  await db.appointment.updateMany({
    where: { id, userId: user.id },
    data: { reminderSentAt: null },
  });

  revalidatePath("/panel/turnos");
}
