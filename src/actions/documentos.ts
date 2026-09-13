"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { str } from "@/lib/format";
import { borrarDocumento } from "@/lib/documentos";

/** Borra un documento escaneado. Lo hace el administrador o quien lo escaneo. */
export async function borrarDocumentoAction(formData: FormData): Promise<void> {
  const sesion = await requireSession();
  if (await borrarDocumento(sesion, str(formData.get("id")))) revalidatePath("/panel/escaner");
}
