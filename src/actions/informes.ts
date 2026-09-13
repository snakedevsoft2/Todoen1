"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwner, requireSession } from "@/lib/auth";
import { crudo, str } from "@/lib/format";
import { agregarFoto } from "@/lib/informes";

export type InformeState = { error?: string; ok?: string } | undefined;

/**
 * Agregar una foto a un reporte desde su ficha.
 *
 * El reporte nuevo se hace con NuevoReporte, que guarda en el telefono y sube
 * por /api/informes. Esto es para completar uno ya enviado. Las reglas (tope
 * de fotos, formato, quien puede) son las mismas: viven en lib/informes.ts.
 */
export async function agregarFotoAction(_prev: InformeState, formData: FormData): Promise<InformeState> {
  const sesion = await requireSession();
  const reportId = str(formData.get("reportId"));
  const r = await agregarFoto(sesion, reportId, {
    image: crudo(formData.get("image")),
    caption: str(formData.get("caption"), "", 120),
  });
  if (!r.ok) return { error: r.error };
  revalidatePath("/panel/informes/" + reportId);
  return { ok: "Foto agregada." };
}

/** La borra el administrador o quien hizo el reporte. */
export async function borrarFotoAction(formData: FormData): Promise<void> {
  const { user, staff } = await requireSession();
  const id = str(formData.get("id"));

  const foto = await db.visitPhoto.findFirst({
    where: { id, userId: user.id },
    select: { id: true, reportId: true, report: { select: { createdByStaffId: true } } },
  });
  if (!foto) return;
  if (staff.role !== "DUENO" && foto.report.createdByStaffId !== staff.id) return;

  await db.visitPhoto.delete({ where: { id: foto.id } });
  revalidatePath("/panel/informes/" + foto.reportId);
}

export async function borrarInformeAction(formData: FormData): Promise<void> {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  await db.visitReport.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/panel/informes");
  redirect("/panel/informes");
}
