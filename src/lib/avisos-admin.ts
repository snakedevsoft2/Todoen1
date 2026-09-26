import type { NegocioSinImagenes } from "./auth";
import { db } from "./db";
import { mailEnabled, sendMail } from "./mail";
import { direccionBase } from "./reset";
import { isProvider, normalizePhone, sendWhatsapp } from "./whatsapp";

/**
 * Le avisa al administrador que un empleado le mando algo: un reporte, una
 * novedad.
 *
 * Por WhatsApp si el negocio tiene envio automatico (CallMeBot o Meta), y por
 * correo si el servidor tiene correo configurado. Con el WhatsApp "por
 * enlace" no hay forma de mandar solo: ahi el aviso es el que sale dentro de
 * la aplicacion.
 *
 * Nunca lanza: lo que el empleado mando ya quedo guardado, y un aviso que no
 * salio no puede hacerle creer que su reporte no llego.
 */
export async function avisarAlAdministrador(
  user: NegocioSinImagenes,
  aviso: { asunto: string; texto: string; ruta: string }
): Promise<void> {
  let enlace = aviso.ruta;
  try {
    enlace = (await direccionBase()) + aviso.ruta;
  } catch {
    // Fuera de una peticion no hay de donde sacar la direccion: va la ruta sola.
  }
  const cuerpo = aviso.texto + "\n\nVer: " + enlace;
  const tareas: Promise<unknown>[] = [];

  const destino = normalizePhone(user.whatsappNumber);
  const provider = isProvider(user.whatsappProvider) ? user.whatsappProvider : "enlace";
  if (user.notifyOnBooking && destino && provider !== "enlace") {
    tareas.push(
      (async () => {
        const r = await sendWhatsapp({
          provider,
          to: destino,
          message: cuerpo,
          apiKey: user.whatsappApiKey,
          phoneId: user.whatsappPhoneId,
        });
        await db.notification.create({
          data: { userId: user.id, provider, toNumber: destino, message: cuerpo, status: r.status, detail: r.detail },
        });
      })()
    );
  }

  if (mailEnabled()) {
    const html =
      "<p>" +
      escapar(aviso.texto).replace(/\n/g, "<br>") +
      '</p><p><a href="' +
      escapar(enlace) +
      '">Abrir en la aplicación</a></p>';
    tareas.push(sendMail({ to: user.email, subject: aviso.asunto, text: cuerpo, html }));
  }

  await Promise.allSettled(tareas);
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
