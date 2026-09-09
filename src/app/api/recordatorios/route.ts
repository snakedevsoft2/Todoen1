import { db } from "@/lib/db";
import { addDays, todayIn } from "@/lib/dates";
import { collectionMessage, debtState, saldo } from "@/lib/debts";
import { pretty12h, prettyDay } from "@/lib/format";
import {
  isProvider,
  reminderMessage,
  sendWhatsapp,
  toInternational,
  type WhatsappProvider,
} from "@/lib/whatsapp";

/**
 * Envio automatico de los recordatorios de manana.
 *
 * Pensado para que Vercel Cron lo llame una vez al dia. Solo manda de verdad a
 * los negocios que configuraron CallMeBot o Meta: con el proveedor "enlace" no
 * hay forma de mandar solo, y esos turnos se quedan en la lista de Turnos para
 * que el barbero los mande con un toque.
 *
 * Se protege con CRON_SECRET para que nadie de afuera dispare los envios.
 */
export const dynamic = "force-dynamic";

/** Cada cuantos dias se le puede volver a cobrar a la misma persona. */
const DIAS_ENTRE_COBROS = 3;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Falta CRON_SECRET. Definelo en Vercel para poder usar los recordatorios." },
      { status: 500 }
    );
  }

  // Vercel Cron manda "Authorization: Bearer <CRON_SECRET>".
  const auth = request.headers.get("authorization");
  const url = new URL(request.url);
  const alterno = url.searchParams.get("secret");
  if (auth !== "Bearer " + secret && alterno !== secret) {
    return new Response("No autorizado.", { status: 401 });
  }

  // Solo los negocios que pueden mandar solos.
  const negocios = await db.user.findMany({
    where: { whatsappProvider: { in: ["callmebot", "meta"] } },
  });

  let enviados = 0;
  let fallidos = 0;
  let sinConfigurar = 0;

  for (const shop of negocios) {
    const manana = addDays(todayIn(shop.timezone), 1);

    const turnos = await db.appointment.findMany({
      where: {
        userId: shop.id,
        day: manana,
        wantsReminder: true,
        reminderSentAt: null,
        status: { in: ["PENDIENTE", "CONFIRMADO"] },
      },
      orderBy: { startTime: "asc" },
    });

    for (const turno of turnos) {
      const to = toInternational(turno.clientPhone, shop.whatsappNumber);
      if (!to) {
        fallidos += 1;
        continue;
      }

      const provider: WhatsappProvider = isProvider(shop.whatsappProvider)
        ? shop.whatsappProvider
        : "enlace";

      const mensaje = reminderMessage({
        businessName: shop.businessName,
        clientName: turno.clientName,
        prettyDay: prettyDay(turno.day),
        time: pretty12h(turno.startTime),
        serviceName: turno.serviceName,
        staffName: turno.staffName,
        address: shop.address,
      });

      const resultado = await sendWhatsapp({
        provider,
        to,
        message: mensaje,
        apiKey: shop.whatsappApiKey,
        phoneId: shop.whatsappPhoneId,
      });

      await db.notification.create({
        data: {
          userId: shop.id,
          provider,
          toNumber: to,
          message: mensaje,
          status: resultado.status,
          detail: resultado.detail,
          appointmentId: turno.id,
        },
      });

      if (resultado.status === "ENVIADO") {
        // Solo lo marcamos cuando de verdad salio: si fallo, el barbero lo ve
        // pendiente en Turnos y lo manda con un toque.
        await db.appointment.update({
          where: { id: turno.id },
          data: { reminderSentAt: new Date() },
        });
        enviados += 1;
      } else if (resultado.status === "SIN_CONFIGURAR") {
        sinConfigurar += 1;
      } else {
        fallidos += 1;
      }
    }
  }

  // Cobros de cartera: lo mismo, pero para las deudas vencidas.
  let cobros = 0;
  for (const shop of negocios) {
    const hoy = todayIn(shop.timezone);
    // No acosamos: como mucho un cobro cada tres dias por deuda.
    const corte = new Date(Date.now() - DIAS_ENTRE_COBROS * 86400000);

    const deudas = await db.debt.findMany({
      where: {
        userId: shop.id,
        status: "PENDIENTE",
        clientPhone: { not: null },
        dueDay: { not: null, lte: hoy },
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: corte } }],
      },
      include: { payments: { select: { amount: true } } },
    });

    for (const deuda of deudas) {
      const pendiente = saldo(deuda);
      if (pendiente <= 0) continue;

      const to = toInternational(deuda.clientPhone, shop.whatsappNumber);
      if (!to) continue;

      const provider: WhatsappProvider = isProvider(shop.whatsappProvider)
        ? shop.whatsappProvider
        : "enlace";

      const mensaje = collectionMessage({
        businessName: shop.businessName,
        clientName: deuda.clientName,
        concept: deuda.concept,
        saldo: pendiente,
        currency: shop.currency,
        estado: debtState(deuda, hoy),
        prettyDue: deuda.dueDay ? prettyDay(deuda.dueDay) : null,
      });

      const resultado = await sendWhatsapp({
        provider,
        to,
        message: mensaje,
        apiKey: shop.whatsappApiKey,
        phoneId: shop.whatsappPhoneId,
      });

      await db.notification.create({
        data: {
          userId: shop.id,
          provider,
          toNumber: to,
          message: mensaje,
          status: resultado.status,
          detail: resultado.detail,
        },
      });

      if (resultado.status === "ENVIADO") {
        await db.debt.update({
          where: { id: deuda.id },
          data: { lastReminderAt: new Date() },
        });
        cobros += 1;
      }
    }
  }

  return Response.json({
    negocios: negocios.length,
    turnos: { enviados, fallidos, sinConfigurar },
    cartera: { cobros },
  });
}
