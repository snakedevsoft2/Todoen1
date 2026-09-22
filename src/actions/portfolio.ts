"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { crudo, parseMoney, str, texto } from "@/lib/format";
import { fondoValido } from "@/lib/fondos";
import { plantillaValida } from "@/lib/plantillas";

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

  const coverInput = crudo(formData.get("publicCover"));
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

  const deliveryEnabled = formData.get("deliveryEnabled") === "on";
  const codPayment = formData.get("codPayment") === "on";
  const onlinePayment = formData.get("onlinePayment") === "on";

  await db.user.update({
    where: { id: user.id },
    data: {
      publicOpen: formData.get("publicOpen") === "on",
      publicShowPrices: formData.get("publicShowPrices") === "on",
      publicHeadline: str(formData.get("publicHeadline")).slice(0, 80) || null,
      publicAbout: texto(formData.get("publicAbout"), 400) || null,
      publicOrderNote: str(formData.get("publicOrderNote")).slice(0, 200) || null,
      // Solo un fondo de la lista: un valor inventado deja la pagina clasica.
      publicBackground: fondoValido(str(formData.get("publicBackground")))
        ? str(formData.get("publicBackground"))
        : "claro",
      // Solo una plantilla de la lista: un valor inventado deja la clasica.
      catalogTemplate: plantillaValida(str(formData.get("catalogTemplate")))
        ? str(formData.get("catalogTemplate"))
        : "clasica",
      deliveryEnabled,
      deliveryFee: deliveryEnabled ? parseMoney(formData.get("deliveryFee"), user.currency) : 0,
      // Sin ninguna forma de pago marcada el catalogo publico se queda sin
      // como cobrar: contra entrega es la que el negocio ya usa hoy.
      codPayment: codPayment || !onlinePayment,
      onlinePayment,
      ...(publicCover !== undefined ? { publicCover } : {}),
    },
  });

  revalidatePath("/panel/portafolio");
  revalidatePath("/catalogo/" + user.slug);
  return { ok: "Portafolio actualizado." };
}
