import type { Customer, User } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { addDays, inicioDelDiaEn, isValidDay, todayIn } from "./dates";
import { mailEnabled, sendMail } from "./mail";
import { sendWhatsapp, sendWhatsappTemplate, toInternational } from "./whatsapp";
import { aplicarPlantilla, esCanalMensaje, primerNombre } from "./crm";
import { falla, textoDe, type Resultado, type Sesion } from "./informes";

/**
 * Mensajes y recordatorios que salen solos a los clientes.
 *
 * Se programan con su hora y los manda enviarProgramados(), que corre en el
 * envio diario (cron) y cada vez que alguien usa el panel. El orden de los
 * canales:
 *
 *   1. WhatsApp por Meta: texto normal si el cliente escribio en las ultimas
 *      24 horas; si no, la plantilla aprobada (Meta no deja otra cosa).
 *   2. Correo, si el cliente tiene y el servidor tiene correo configurado.
 *   3. Si nada automatico sirvio y hay telefono, queda "para enviar a mano":
 *      el dueño lo manda con un toque desde Clientes > Mensajes.
 */

const DIA = 86_400_000;
const MAX_PENDIENTES = 5000;

export type Canales = { whatsapp: boolean; plantilla: boolean; correo: boolean };

export function canalesDe(user: Pick<User, "whatsappProvider" | "whatsappApiKey" | "whatsappPhoneId" | "whatsappTemplate">): Canales {
  const whatsapp = user.whatsappProvider === "meta" && Boolean(user.whatsappApiKey && user.whatsappPhoneId);
  return { whatsapp, plantilla: whatsapp && Boolean(user.whatsappTemplate), correo: mailEnabled() };
}

/** "YYYY-MM-DDTHH:mm" en la zona del negocio -> fecha real. */
export function fechaDeEnvio(valor: string, timezone: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(valor);
  if (!m || !isValidDay(m[1])) return null;
  // Que el dia exista de verdad: "30 de febrero" no se corre al 2 de marzo.
  const [a, mes, d] = m[1].split("-").map(Number);
  const real = new Date(Date.UTC(a, mes - 1, d));
  if (real.getUTCMonth() !== mes - 1 || real.getUTCDate() !== d) return null;
  const h = Number(m[2]);
  const min = Number(m[3]);
  if (h > 23 || min > 59) return null;
  return new Date(inicioDelDiaEn(m[1], timezone).getTime() + (h * 60 + min) * 60_000);
}

/** Las opciones rapidas de la pantalla ("mañana", "en una semana") a una hora. */
export function cuandoAValor(cuando: string, fecha: string, timezone: string): string {
  const hoy = todayIn(timezone);
  if (cuando === "manana") return addDays(hoy, 1) + "T09:00";
  if (cuando === "semana") return addDays(hoy, 7) + "T09:00";
  if (cuando === "fecha") return fecha;
  return "ahora";
}

export async function programarMensaje(
  s: Sesion,
  d: { customerIds: string[]; text: unknown; channel: unknown; cuando: string }
): Promise<Resultado<{ creados: number; inmediato: boolean }>> {
  const text = textoDe(d.text, 1000);
  if (text.length < 2) return falla("Escribe el mensaje.");
  const channel = esCanalMensaje(d.channel) ? d.channel : "auto";

  const ahora = new Date();
  let sendAt = ahora;
  if (d.cuando !== "ahora") {
    const f = fechaDeEnvio(d.cuando, s.user.timezone);
    if (!f) return falla("Elige una fecha y una hora válidas.");
    if (f.getTime() > ahora.getTime() + 366 * DIA) return falla("Se puede programar hasta un año adelante.");
    sendAt = f < ahora ? ahora : f;
  }

  const ids = Array.from(new Set(d.customerIds.filter((x) => typeof x === "string"))).slice(0, 500);
  const clientes = await db.customer.findMany({ where: { userId: s.user.id, id: { in: ids } }, select: { id: true } });
  if (clientes.length === 0) return falla("Elige al menos un cliente.");

  const pendientes = await db.scheduledMessage.count({ where: { userId: s.user.id, status: { in: ["PENDIENTE", "MANUAL"] } } });
  if (pendientes + clientes.length > MAX_PENDIENTES) return falla("Tienes demasiados mensajes pendientes. Cancela algunos.");

  const batchId = clientes.length > 1 ? randomUUID() : null;
  await db.scheduledMessage.createMany({
    data: clientes.map((c) => ({
      userId: s.user.id,
      customerId: c.id,
      channel,
      text,
      sendAt,
      createdByStaffId: s.staff.id,
      batchId,
    })),
  });
  return { ok: true, datos: { creados: clientes.length, inmediato: sendAt.getTime() <= ahora.getTime() } };
}

type Entrega = { status: "ENVIADO" | "FALLIDO" | "MANUAL"; via: string | null; detail: string; texto: string };

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

async function entregar(user: User, c: Customer, channel: string, plantilla: string): Promise<Entrega> {
  const texto = aplicarPlantilla(plantilla, { nombre: c.name, negocio: user.businessName });
  const telefono = c.phone ? toInternational(c.phone, user.whatsappNumber, user.timezone) : null;
  const motivos: string[] = [];

  if (channel !== "correo") {
    const canales = canalesDe(user);
    if (!telefono) motivos.push("sin teléfono");
    else if (!canales.whatsapp) motivos.push("WhatsApp automático sin conectar");
    else {
      const escribioHace = await db.agentConversation.findFirst({
        where: {
          userId: user.id,
          channel: "whatsapp",
          contactKey: telefono,
          lastMessageAt: { gte: new Date(Date.now() - 23.5 * 3_600_000) },
        },
        select: { id: true },
      });
      const r = escribioHace
        ? await sendWhatsapp({ provider: "meta", to: telefono, message: texto, apiKey: user.whatsappApiKey, phoneId: user.whatsappPhoneId })
        : user.whatsappTemplate
          ? await sendWhatsappTemplate({
              to: telefono,
              template: user.whatsappTemplate,
              lang: user.whatsappTemplateLang,
              params: [primerNombre(c.name) || c.name, texto],
              apiKey: user.whatsappApiKey,
              phoneId: user.whatsappPhoneId,
            })
          : null;
      if (r?.status === "ENVIADO") return { status: "ENVIADO", via: "whatsapp", detail: r.detail, texto };
      motivos.push(r ? r.detail : "Meta pide una plantilla aprobada para escribirle a quien no te ha escrito en 24 horas");
    }
  }

  if (channel !== "whatsapp") {
    if (!c.email) motivos.push("sin correo");
    else if (!mailEnabled()) motivos.push("correo sin configurar");
    else {
      const salio = await sendMail({
        to: c.email,
        subject: "Mensaje de " + user.businessName,
        text: texto,
        html: "<p>" + escapar(texto).replace(/\n/g, "<br>") + "</p>",
      });
      if (salio) return { status: "ENVIADO", via: "correo", detail: "Enviado por correo.", texto };
      motivos.push("el correo no salió");
    }
  }

  if (telefono) return { status: "MANUAL", via: "enlace", detail: motivos.join(" · "), texto };
  return { status: "FALLIDO", via: null, detail: motivos.join(" · ") || "No hay por dónde enviarlo.", texto };
}

/**
 * Manda los mensajes que ya llegaron a su hora.
 *
 * Cada uno se aparta (ENVIANDO) antes de mandarlo, con una actualizacion que
 * solo gana uno: si el cron y una visita al panel llegan al mismo tiempo, el
 * cliente no recibe el mensaje dos veces. Uno que quedo apartado por un envio
 * que se cayo a mitad vuelve a la cola a los diez minutos.
 */
export async function enviarProgramados(opciones: { userId?: string; limite?: number } = {}) {
  const ahora = new Date();
  const deQuien = opciones.userId ? { userId: opciones.userId } : {};
  await db.scheduledMessage.updateMany({
    where: { ...deQuien, status: "ENVIANDO", updatedAt: { lt: new Date(ahora.getTime() - 10 * 60_000) } },
    data: { status: "PENDIENTE" },
  });

  const vencidos = await db.scheduledMessage.findMany({
    where: { ...deQuien, status: "PENDIENTE", sendAt: { lte: ahora } },
    orderBy: { sendAt: "asc" },
    take: opciones.limite ?? 50,
    select: { id: true },
  });

  let enviados = 0;
  let fallidos = 0;
  let manuales = 0;
  for (const { id } of vencidos) {
    const apartado = await db.scheduledMessage.updateMany({ where: { id, status: "PENDIENTE" }, data: { status: "ENVIANDO" } });
    if (apartado.count === 0) continue;
    const m = await db.scheduledMessage.findUnique({ where: { id }, include: { customer: true, user: true } });
    if (!m) continue;

    let r: Entrega;
    try {
      r = await entregar(m.user, m.customer, m.channel, m.text);
    } catch (e) {
      r = { status: "FALLIDO", via: null, detail: "Error inesperado: " + String(e).slice(0, 120), texto: m.text };
    }

    await db.scheduledMessage.update({
      where: { id },
      data: { status: r.status, via: r.via, detail: r.detail.slice(0, 300) || null, sentAt: r.status === "ENVIADO" ? new Date() : null },
    });

    if (r.status === "ENVIADO") {
      enviados += 1;
      await db.interaction.create({
        data: {
          userId: m.userId,
          customerId: m.customerId,
          kind: r.via === "correo" ? "CORREO" : "WHATSAPP",
          text: "Mensaje automático: " + r.texto,
          staffName: "Envío automático",
        },
      });
      await db.customer.update({ where: { id: m.customerId }, data: { lastContactAt: new Date() } });
    } else if (r.status === "MANUAL") {
      manuales += 1;
    } else {
      fallidos += 1;
    }
  }
  return { enviados, fallidos, manuales };
}
