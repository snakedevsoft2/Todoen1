import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Los mensajes que Meta nos manda cuando alguien le escribe al WhatsApp del
 * negocio.
 */

/**
 * Comprueba que el aviso lo mando Meta.
 *
 * Meta firma el cuerpo con la clave secreta de la app. Sin esta comprobacion,
 * cualquiera que conozca la direccion podria hacerse pasar por un cliente y
 * poner al agente a agendar turnos o gastar la cuota del modelo.
 */
export function firmaValida(cuerpo: string, cabecera: string | null, secreto: string): boolean {
  if (!cabecera || !secreto) return false;
  const [algoritmo, firma] = cabecera.split("=");
  if (algoritmo !== "sha256" || !firma || !/^[0-9a-f]{64}$/i.test(firma)) return false;
  const esperada = createHmac("sha256", secreto).update(cuerpo, "utf8").digest();
  const recibida = Buffer.from(firma, "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

export type MensajeEntrante = {
  /** El numero del negocio en Meta: con esto se sabe de que negocio es. */
  phoneNumberId: string;
  /** Quien escribe, en digitos con indicativo. */
  from: string;
  /** El id del mensaje, para no contestarlo dos veces. */
  id: string;
  /** El texto. Null si mando una foto, un audio o algo que no es texto. */
  text: string | null;
  /** El nombre que tiene puesto en su WhatsApp, si Meta lo manda. */
  name: string | null;
};

type Payload = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: { from?: string; id?: string; type?: string; text?: { body?: string } }[];
      };
    }[];
  }[];
};

/**
 * Saca los mensajes del aviso de Meta.
 *
 * Un mismo aviso puede traer varios mensajes, y tambien trae cosas que no son
 * mensajes (confirmaciones de entrega, de lectura): esas se ignoran.
 */
export function extraerMensajes(payload: unknown): MensajeEntrante[] {
  const out: MensajeEntrante[] = [];
  const entradas = (payload as Payload)?.entry;
  if (!Array.isArray(entradas)) return out;

  for (const entrada of entradas) {
    for (const cambio of entrada?.changes ?? []) {
      const valor = cambio?.value;
      const phoneNumberId = String(valor?.metadata?.phone_number_id ?? "");
      if (!phoneNumberId || !Array.isArray(valor?.messages)) continue;

      for (const m of valor.messages) {
        const from = String(m?.from ?? "").replace(/\D/g, "");
        const id = String(m?.id ?? "");
        if (!from || !id) continue;
        const contacto = valor.contacts?.find((c) => c?.wa_id === m.from) ?? valor.contacts?.[0];
        out.push({
          phoneNumberId,
          from,
          id: id.slice(0, 200),
          text: m.type === "text" ? String(m.text?.body ?? "") : null,
          name: contacto?.profile?.name ? String(contacto.profile.name).slice(0, 80) : null,
        });
      }
    }
  }
  return out;
}
