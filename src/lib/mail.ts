import { APP_NAME } from "./brand";

/**
 * Envio de correo con Resend.
 *
 * Lo hacemos con fetch contra su API en vez de instalar el paquete: es una
 * sola peticion con un JSON, y asi no metemos una dependencia mas al proyecto
 * por algo de diez lineas.
 *
 * Para que funcione hay que crear la cuenta en https://resend.com, sacar la
 * llave y ponerla en RESEND_API_KEY. Sin esa llave no se manda nada y la
 * pantalla de recuperar clave no aparece: mejor eso que un boton que promete
 * un correo que nunca llega.
 */

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Remitente por defecto.
 *
 * El dominio onboarding@resend.dev lo presta Resend para probar, pero solo
 * deja mandarle al correo con el que se abrio la cuenta. Para escribirle a los
 * clientes hay que verificar un dominio propio y ponerlo en MAIL_FROM.
 */
const DEFAULT_FROM = APP_NAME + " <onboarding@resend.dev>";

export function mailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export type Mail = {
  to: string;
  subject: string;
  /** Cuerpo en HTML. */
  html: string;
  /** El mismo texto sin etiquetas, para los correos que no muestran HTML. */
  text: string;
};

/**
 * Manda el correo. Devuelve si salio o no.
 *
 * No lanza nunca: quien llama decide que hacer si no salio, y ninguna pantalla
 * se debe caer porque el servicio de correo este de malas.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || DEFAULT_FROM,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });

    if (!response.ok) {
      // El cuerpo trae el motivo (dominio sin verificar, llave mala...) y sin
      // el no hay forma de saber por que no llego el correo.
      const detalle = await response.text().catch(() => "");
      console.error("Resend respondio " + response.status + ": " + detalle);
      return false;
    }
    return true;
  } catch (error) {
    console.error("No se pudo mandar el correo:", error);
    return false;
  }
}
