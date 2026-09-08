/**
 * Avisos por WhatsApp.
 *
 * Hay tres formas de avisar, de la mas simple a la mas completa:
 *
 * 1. "enlace"    Sin configurar nada. Al separar el turno, el cliente recibe un
 *                boton que abre WhatsApp con el mensaje ya escrito para el
 *                negocio. Solo tiene que darle enviar.
 * 2. "callmebot" Gratis y automatico. El dueno le escribe una vez al bot desde
 *                su WhatsApp y recibe una clave. Con esa clave la aplicacion
 *                manda el aviso sola.
 * 3. "meta"      API oficial de WhatsApp Business. Necesita cuenta de empresa,
 *                token y plantilla aprobada.
 */

export type WhatsappProvider = "enlace" | "callmebot" | "meta";

export const WHATSAPP_PROVIDERS: { value: WhatsappProvider; label: string; hint: string }[] = [
  {
    value: "enlace",
    label: "Solo enlace",
    hint: "El cliente toca un boton y te manda el aviso desde su WhatsApp. No hay que configurar nada.",
  },
  {
    value: "callmebot",
    label: "Automatico gratis (CallMeBot)",
    hint: "La aplicacion te manda el aviso sola. Necesitas pedir una clave gratuita una sola vez.",
  },
  {
    value: "meta",
    label: "WhatsApp Business oficial (Meta)",
    hint: "Para negocios con cuenta de WhatsApp Business API. Necesita token y plantilla aprobada.",
  },
];

export function isProvider(value: string | null | undefined): value is WhatsappProvider {
  return value === "enlace" || value === "callmebot" || value === "meta";
}

/** Deja el numero en solo digitos, con indicativo del pais. */
export function normalizePhone(input: string | null | undefined): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.slice(0, 15);
}

/**
 * Completa el indicativo del pais cuando el cliente escribio solo su numero
 * local. Toma el indicativo del numero del negocio.
 */
export function toInternational(
  phone: string | null | undefined,
  ownerNumber?: string | null
): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (digits.length >= 11) return digits.slice(0, 15);

  const owner = String(ownerNumber ?? "").replace(/\D/g, "");
  if (owner.length > 10) {
    const prefix = owner.slice(0, owner.length - 10);
    return (prefix + digits).slice(0, 15);
  }
  return digits;
}

/** Enlace que abre WhatsApp con el mensaje ya escrito. */
export function waLink(phone: string | null | undefined, message: string): string | null {
  const number = normalizePhone(phone);
  if (!number) return null;
  return "https://wa.me/" + number + "?text=" + encodeURIComponent(message);
}

/** Muestra el numero de forma legible, por ejemplo +57 317 448 5643. */
export function prettyPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 10) return "+" + digits;
  const country = digits.slice(0, digits.length - 10);
  const rest = digits.slice(-10);
  return `+${country} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
}

export type SendResult = {
  status: "ENVIADO" | "FALLIDO" | "SIN_CONFIGURAR";
  detail: string;
};

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Manda el aviso. Nunca lanza: siempre devuelve como le fue, para que un
 * problema de red jamas tumbe la reserva del cliente.
 */
export async function sendWhatsapp(options: {
  provider: WhatsappProvider;
  to: string;
  message: string;
  apiKey?: string | null;
  phoneId?: string | null;
}): Promise<SendResult> {
  const { provider, to, message } = options;
  const apiKey = (options.apiKey ?? "").trim();
  const phoneId = (options.phoneId ?? "").trim();

  if (provider === "enlace") {
    return {
      status: "SIN_CONFIGURAR",
      detail: "Aviso listo para enviar con un toque desde el enlace de WhatsApp.",
    };
  }

  if (provider === "callmebot") {
    if (!apiKey) {
      return { status: "SIN_CONFIGURAR", detail: "Falta la clave de CallMeBot." };
    }
    try {
      const url =
        "https://api.callmebot.com/whatsapp.php?phone=" +
        encodeURIComponent(to) +
        "&text=" +
        encodeURIComponent(message) +
        "&apikey=" +
        encodeURIComponent(apiKey);
      const res = await fetchWithTimeout(url);
      const body = (await res.text()).slice(0, 300);
      if (!res.ok) return { status: "FALLIDO", detail: "CallMeBot respondio " + res.status + ": " + body };
      if (/error|invalid|not\s*found/i.test(body)) {
        return { status: "FALLIDO", detail: body };
      }
      return { status: "ENVIADO", detail: "Enviado con CallMeBot." };
    } catch (error) {
      return { status: "FALLIDO", detail: "No se pudo contactar a CallMeBot: " + String(error).slice(0, 160) };
    }
  }

  // Meta (WhatsApp Business API oficial)
  if (!apiKey || !phoneId) {
    return { status: "SIN_CONFIGURAR", detail: "Faltan el token o el identificador del numero de Meta." };
  }
  try {
    const res = await fetchWithTimeout(
      "https://graph.facebook.com/v21.0/" + encodeURIComponent(phoneId) + "/messages",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: false, body: message },
        }),
      }
    );
    const body = (await res.text()).slice(0, 300);
    if (!res.ok) return { status: "FALLIDO", detail: "Meta respondio " + res.status + ": " + body };
    return { status: "ENVIADO", detail: "Enviado con la API oficial de WhatsApp." };
  } catch (error) {
    return { status: "FALLIDO", detail: "No se pudo contactar a Meta: " + String(error).slice(0, 160) };
  }
}

/** Texto del aviso que le llega al dueno cuando alguien separa un turno. */
export function bookingMessage(input: {
  businessName: string;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  price: string;
  prettyDay: string;
  time: string;
  notes?: string | null;
}): string {
  const lines = [
    "Nuevo turno en " + input.businessName,
    "",
    "Cliente: " + input.clientName,
    "Telefono: " + input.clientPhone,
    "Dia: " + input.prettyDay,
    "Hora: " + input.time,
    "Servicio: " + input.serviceName + " (" + input.price + ")",
  ];
  if (input.notes) lines.push("Nota: " + input.notes);
  return lines.join("\n");
}

/** Texto para que el negocio le confirme el turno al cliente. */
export function confirmMessage(input: {
  businessName: string;
  clientName: string;
  prettyDay: string;
  time: string;
  serviceName: string;
}): string {
  return [
    "Hola " + input.clientName + ", te confirmamos tu turno en " + input.businessName + ".",
    "",
    "Dia: " + input.prettyDay,
    "Hora: " + input.time,
    "Servicio: " + input.serviceName,
    "",
    "Te esperamos puntual.",
  ].join("\n");
}
