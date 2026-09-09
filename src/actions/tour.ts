"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

/**
 * Marca el instructivo como visto.
 *
 * Es lo mismo terminarlo que omitirlo: en los dos casos la persona ya decidio,
 * y no se lo volvemos a poner encima. Siempre lo puede volver a abrir desde
 * Ajustes.
 */
export async function finishTourAction() {
  const { staff } = await requireSession();
  await db.staff.update({
    where: { id: staff.id },
    data: { tourDoneAt: new Date() },
  });
  revalidatePath("/panel");
  revalidatePath("/panel/ajustes");
}

/** Volver a verlo desde Ajustes. */
export async function restartTourAction() {
  const { staff } = await requireSession();
  await db.staff.update({
    where: { id: staff.id },
    data: { tourDoneAt: null },
  });
  revalidatePath("/panel");
  revalidatePath("/panel/ajustes");
}
