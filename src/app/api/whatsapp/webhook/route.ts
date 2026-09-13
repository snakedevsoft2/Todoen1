import { after } from "next/server";
import { db } from "@/lib/db";
import { sendWhatsapp } from "@/lib/whatsapp";
import { configDe, responderAgente } from "@/lib/agente";
import { extraerMensajes, firmaValida, type MensajeEntrante } from "@/lib/whatsapp-entrante";

/**
 * La direccion a la que Meta avisa cuando alguien le escribe al WhatsApp de un
 * negocio.
 *
 * Una sola direccion sirve a todos los negocios: el aviso trae el id del
 * numero que recibio el mensaje, y ese id es el que cada negocio guardo al
 * conectar su WhatsApp con Meta.
 *
 * Se contesta "OK" de inmediato y el agente trabaja despues (after): Meta
 * reintenta si no le respondemos rapido, y el modelo puede tardar varios
 * segundos. El id de cada mensaje evita contestar dos veces si igual llega
 * repetido.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Meta llama aqui una vez, al conectar la direccion, para comprobar que es nuestra. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (
    token &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === token
  ) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const secreto = process.env.WHATSAPP_APP_SECRET ?? "";
  const cuerpo = await request.text();
  if (!firmaValida(cuerpo, request.headers.get("x-hub-signature-256"), secreto)) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(cuerpo);
  } catch {
    return new Response("OK");
  }

  const mensajes = extraerMensajes(payload).slice(0, 10);
  if (mensajes.length > 0) after(() => atender(mensajes));
  return new Response("OK");
}

async function atender(mensajes: MensajeEntrante[]) {
  for (const m of mensajes) {
    try {
      const shop = await db.user.findFirst({
        where: { whatsappProvider: "meta", whatsappPhoneId: m.phoneNumberId, suspendedAt: null },
      });
      if (!shop?.whatsappApiKey || !shop.whatsappPhoneId) continue;
      const config = await configDe(shop.id);
      if (!config.whatsappOn) continue;

      let respuesta: string;
      if (m.text === null) {
        respuesta = "Por ahora solo puedo leer mensajes de texto. ¿Me cuentas por escrito qué necesitas?";
      } else {
        const r = await responderAgente({
          shop,
          canal: "whatsapp",
          contactKey: m.from,
          contactName: m.name,
          mensaje: m.text,
          externalId: m.id,
        });
        if (!r.ok || r.repetido || !r.texto) continue;
        respuesta = r.texto;
      }

      const envio = await sendWhatsapp({
        provider: "meta",
        to: m.from,
        message: respuesta,
        apiKey: shop.whatsappApiKey,
        phoneId: shop.whatsappPhoneId,
      });
      if (envio.status !== "ENVIADO") console.error("El agente no pudo enviar el WhatsApp:", envio.detail);
    } catch (error) {
      console.error("No se pudo atender un WhatsApp:", error);
    }
  }
}
