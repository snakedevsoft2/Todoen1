"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { str } from "@/lib/format";

export type PortfolioState = { error?: string; ok?: string } | undefined;

const MAX_COVER_BYTES = 500 * 1024;
const ALLOWED_COVER = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Como se ve el portafolio publico del negocio.
 *
 * Solo el dueno: es la cara que el negocio le muestra a sus clientes.
 */
export async function updatePortfolioAction(
  _prev: PortfolioState,
  formData: FormData
): Promise<PortfolioState> {
  const { user } = await requireOwner();

  const coverInput = str(formData.get("publicCover"));
  let publicCover: string | null | undefined;
  if (coverInput === "__borrar__") {
    publicCover = null;
  } else if (coverInput) {
    if (!ALLOWED_COVER.test(coverInput)) {
      return { error: "La portada debe ser una imagen PNG, JPG o WEBP." };
    }
    if (coverInput.length > MAX_COVER_BYTES * 1.4) {
      return { error: "La portada pesa demasiado. Sube una imagen mas liviana." };
    }
    publicCover = coverInput;
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      publicOpen: formData.get("publicOpen") === "on",
      publicShowPrices: formData.get("publicShowPrices") === "on",
      publicHeadline: str(formData.get("publicHeadline")).slice(0, 80) || null,
      publicAbout: str(formData.get("publicAbout")).slice(0, 400) || null,
      publicOrderNote: str(formData.get("publicOrderNote")).slice(0, 200) || null,
      ...(publicCover !== undefined ? { publicCover } : {}),
    },
  });

  revalidatePath("/panel/portafolio");
  revalidatePath("/catalogo/" + user.slug);
  return { ok: "Portafolio actualizado." };
}
