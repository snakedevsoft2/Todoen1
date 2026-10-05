"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner, requireSession } from "@/lib/auth";
import { str } from "@/lib/format";
import { anularSolicitud, borrarSolicitud, quitarDocumento } from "@/lib/firmas";

// Firmas es una de las pantallas fijas del empleado de asistencia: sin
// avisarle a requireSession(), una accion suya lo mandaria a Marcar.

/** Cancela una solicitud que no han firmado: el enlace deja de servir. */
export async function anularFirmaAction(formData: FormData): Promise<void> {
  const sesion = await requireSession({ asistenciaOk: true });
  const id = str(formData.get("id"));
  if (await anularSolicitud(sesion, id)) {
    revalidatePath("/panel/firmas");
    revalidatePath("/panel/firmas/" + id);
  }
}

/** Quita un documento de una solicitud que no han firmado. */
export async function quitarDocumentoFirmaAction(formData: FormData): Promise<void> {
  const sesion = await requireSession({ asistenciaOk: true });
  const requestId = await quitarDocumento(sesion, str(formData.get("id")));
  if (requestId) revalidatePath("/panel/firmas/" + requestId);
}

/** Borra la solicitud con sus documentos, firmados o no. Solo el dueño. */
export async function borrarFirmaAction(formData: FormData): Promise<void> {
  const sesion = await requireOwner();
  if (await borrarSolicitud(sesion, str(formData.get("id")))) revalidatePath("/panel/firmas");
  redirect("/panel/firmas");
}
