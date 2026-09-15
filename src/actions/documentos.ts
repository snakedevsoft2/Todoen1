"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { str } from "@/lib/format";
import { borrarDocumento } from "@/lib/documentos";

/** Borra un documento escaneado. Solo el dueño: el empleado no borra lo que ya quedo guardado. */
export async function borrarDocumentoAction(formData: FormData): Promise<void> {
  const sesion = await requireOwner();
  if (await borrarDocumento(sesion, str(formData.get("id")))) revalidatePath("/panel/escaner");
}
