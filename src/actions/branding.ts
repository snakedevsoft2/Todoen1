"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { str } from "@/lib/format";
import { isTheme, normalizeHex } from "@/lib/theme";
import {
  isProvider,
  normalizePhone,
  prettyPhone,
  sendWhatsapp,
  type WhatsappProvider,
} from "@/lib/whatsapp";

export type BrandingState = { error?: string; ok?: string } | undefined;

const MAX_LOGO_BYTES = 160 * 1024;
const ALLOWED_LOGO = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

/** Colores, tema, frase y logo del negocio. */
export async function updateBrandingAction(
  _prev: BrandingState,
  formData: FormData
): Promise<BrandingState> {
  const { user } = await requireOwner();

  const brandColor = normalizeHex(str(formData.get("brandColor")));
  const themeInput = str(formData.get("theme"), user.theme);
  const theme = isTheme(themeInput) ? themeInput : "claro";
  const tagline = str(formData.get("tagline")).slice(0, 120);

  const logoInput = str(formData.get("logo"));
  let logo: string | null | undefined;

  if (logoInput === "__borrar__") {
    logo = null;
  } else if (logoInput) {
    if (!ALLOWED_LOGO.test(logoInput)) {
      return { error: "El logo debe ser una imagen PNG, JPG, WEBP o SVG." };
    }
    if (logoInput.length > MAX_LOGO_BYTES * 1.4) {
      return { error: "El logo pesa demasiado. Sube una imagen mas liviana." };
    }
    logo = logoInput;
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      brandColor,
      theme,
      tagline: tagline || null,
      ...(logo !== undefined ? { logo } : {}),
    },
  });

  revalidatePath("/panel", "layout");
  revalidatePath("/reservar/" + user.slug);
  return { ok: "Personalizacion guardada." };
}

/** Numero y forma de envio de los avisos por WhatsApp. */
export async function updateWhatsappAction(
  _prev: BrandingState,
  formData: FormData
): Promise<BrandingState> {
  const { user } = await requireOwner();

  const rawNumber = str(formData.get("whatsappNumber"));
  const number = rawNumber ? normalizePhone(rawNumber) : null;
  if (rawNumber && !number) {
    return { error: "Escribe el numero con indicativo del pais, por ejemplo +57 317 448 5643." };
  }

  const providerInput = str(formData.get("whatsappProvider"), "enlace");
  const provider: WhatsappProvider = isProvider(providerInput) ? providerInput : "enlace";
  const apiKey = str(formData.get("whatsappApiKey"));
  const phoneId = str(formData.get("whatsappPhoneId"));

  if (provider === "callmebot" && !apiKey) {
    return { error: "Para el envio automatico gratis necesitas pegar la clave de CallMeBot." };
  }
  if (provider === "meta" && (!apiKey || !phoneId)) {
    return { error: "Para la API oficial necesitas el token y el identificador del numero." };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      whatsappNumber: number,
      whatsappProvider: provider,
      whatsappApiKey: apiKey || null,
      whatsappPhoneId: phoneId || null,
      notifyOnBooking: formData.get("notifyOnBooking") === "on",
    },
  });

  revalidatePath("/panel/personalizar");
  revalidatePath("/panel/avisos");
  return { ok: "Avisos por WhatsApp guardados." };
}

/** Manda un mensaje de prueba al numero configurado y lo deja en el historial. */
export async function testWhatsappAction(
  _prev: BrandingState,
  _formData: FormData
): Promise<BrandingState> {
  const { user } = await requireOwner();
  const destino = normalizePhone(user.whatsappNumber);
  if (!destino) return { error: "Primero guarda el numero que va a recibir los avisos." };

  const provider: WhatsappProvider = isProvider(user.whatsappProvider)
    ? user.whatsappProvider
    : "enlace";
  const message =
    "Prueba de avisos de " +
    user.businessName +
    ". Si te llego este mensaje, los avisos de turnos van a llegarte aqui.";

  let resultado;
  try {
    resultado = await sendWhatsapp({
      provider,
      to: destino,
      message,
      apiKey: user.whatsappApiKey,
      phoneId: user.whatsappPhoneId,
    });
  } catch {
    resultado = { status: "FALLIDO" as const, detail: "Error inesperado al enviar la prueba." };
  }

  await db.notification.create({
    data: {
      userId: user.id,
      provider,
      toNumber: destino,
      message,
      status: resultado.status,
      detail: resultado.detail,
    },
  });

  revalidatePath("/panel/avisos");

  if (resultado.status === "ENVIADO") {
    return { ok: "Mensaje de prueba enviado a " + prettyPhone(destino) + "." };
  }
  if (resultado.status === "SIN_CONFIGURAR") {
    return {
      ok:
        "Con el modo de solo enlace no se envia solo. Usa el boton de WhatsApp para mandarlo a " +
        prettyPhone(destino) +
        ".",
    };
  }
  return { error: "No se pudo enviar: " + resultado.detail };
}

export async function clearNotificationsAction() {
  const { user } = await requireOwner();
  await db.notification.deleteMany({ where: { userId: user.id } });
  revalidatePath("/panel/avisos");
}
