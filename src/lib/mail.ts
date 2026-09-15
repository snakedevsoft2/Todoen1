import nodemailer from "nodemailer";
import { APP_NAME } from "./brand";

/**
 * Envio de correo: por Gmail (o cualquier SMTP) o por Resend.
 *
 * Gmail, para mandar desde tu propio correo:
 *   SMTP_USER  el correo de Gmail, ej. tucorreo@gmail.com
 *   SMTP_PASS  una "contrasena de aplicacion" de Google (16 letras), NO la
 *              clave normal de la cuenta. Se saca en
 *              https://myaccount.google.com/apppasswords con la verificacion
 *              en dos pasos activada. Puede ir con o sin espacios.
 * Gmail deja mandar unos 500 correos al dia: de sobra para recuperar claves.
 * Para otro servidor se agregan SMTP_HOST y SMTP_PORT.
 *
 * Resend, para mandar desde un dominio propio verificado:
 *   RESEND_API_KEY y MAIL_FROM.
 *
 * Si estan los dos, sale por SMTP. Sin ninguno no se manda nada y la pantalla
 * de recuperar clave no aparece: mejor eso que un boton que promete un correo
 * que nunca llega.
 */

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Remitente por defecto de Resend.
 *
 * El dominio onboarding@resend.dev lo presta Resend para probar, pero solo
 * deja mandarle al correo con el que se abrio la cuenta. Para escribirle a los
 * clientes hay que verificar un dominio propio y ponerlo en MAIL_FROM.
 */
const DEFAULT_FROM = APP_NAME + " <onboarding@resend.dev>";

function datosSmtp(): { user: string; pass: string } | null {
  const user = process.env.SMTP_USER?.trim();
  // Google muestra la contrasena de aplicacion en grupos de cuatro con espacios.
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  return user && pass ? { user, pass } : null;
}

export function mailEnabled(): boolean {
  return Boolean(datosSmtp() || process.env.RESEND_API_KEY);
}

/** Por donde salen los correos, para mostrarlo en pantalla. */
export function canalDeCorreo(): "smtp" | "resend" | null {
  return datosSmtp() ? "smtp" : process.env.RESEND_API_KEY ? "resend" : null;
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
  const smtp = datosSmtp();
  if (smtp) return porSmtp(smtp, mail);
  if (process.env.RESEND_API_KEY) return porResend(process.env.RESEND_API_KEY, mail);
  return false;
}

async function porSmtp(smtp: { user: string; pass: string }, mail: Mail): Promise<boolean> {
  const port = Number(process.env.SMTP_PORT || 465);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    // 465 va cifrado desde el principio; 587 empieza sin cifrar y lo pide despues.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
    // Sin limite, una pantalla se quedaria esperando a un servidor que no responde.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    await transporte.sendMail({
      // Gmail cambia el remitente por la cuenta con la que se entro: por eso
      // por defecto es ese mismo correo, con el nombre de la aplicacion.
      from: process.env.MAIL_FROM || { name: APP_NAME, address: smtp.user },
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    return true;
  } catch (error) {
    // El motivo (clave de aplicacion mala, cuenta sin verificacion en dos
    // pasos...) sale en el registro del servidor; la clave nunca.
    console.error("No se pudo mandar el correo por SMTP:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    transporte.close();
  }
}

async function porResend(key: string, mail: Mail): Promise<boolean> {
  try {
    // RESEND_BASE_URL solo se usa en las pruebas, para no mandar correos de verdad.
    const response = await fetch(process.env.RESEND_BASE_URL || ENDPOINT, {
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
