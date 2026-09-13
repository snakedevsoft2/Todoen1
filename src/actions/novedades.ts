"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { str } from "@/lib/format";

/**
 * El administrador aprueba o rechaza una novedad.
 *
 * Se puede cambiar despues (aprobar una que habia rechazado cuando llega el
 * soporte): lo que queda es la ultima decision, con quien la tomo y cuando.
 */
export async function revisarNovedadAction(decisionIn: string, formData: FormData): Promise<void> {
  const { user, staff } = await requireOwner();
  const id = str(formData.get("id"));
  // La decision llega atada al boton y no como campo del formulario: React no
  // manda el name/value del boton que se toco, y sin esto "Aprobar" no hacia
  // nada.
  const decision = decisionIn;
  if (decision !== "APROBADA" && decision !== "RECHAZADA") return;

  await db.novelty.updateMany({
    where: { id, userId: user.id },
    data: {
      status: decision,
      reviewedAt: new Date(),
      reviewedByStaffId: staff.id,
      reviewNote: str(formData.get("note"), "", 200) || null,
    },
  });
  revalidatePath("/panel/novedades");
  revalidatePath("/panel/planilla");
  revalidatePath("/panel");
}
