import { db } from "@/lib/db";
import { enviarProgramados } from "@/lib/envios-crm";
import { reintentarFacturas } from "@/lib/facturacion";
import { borrarUbicacionesViejas } from "@/lib/ubicacion";
import { suspenderVencidas } from "@/lib/pagos";
import { addDays, todayIn } from "@/lib/dates";
import { abonado, collectionMessage, debtState, saldo } from "@/lib/debts";
import { estadoPrestamo, planDeDeuda } from "@/lib/prestamos";
import { avisarAlAdministrador } from "@/lib/avisos-admin";
import { money, pretty12h, prettyDay } from "@/lib/format";
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
    // Sin las imagenes: aqui no se usan y son las columnas mas pesadas de la fila.
    omit: { logo: true, publicCover: true },
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
      const to = toInternational(turno.clientPhone, shop.whatsappNumber, shop.timezone);
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

      const to = toInternational(deuda.clientPhone, shop.whatsappNumber, shop.timezone);
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

  // Aviso al dueño de cartera: a quien le toca cobrar hoy, de un vistazo.
  // Una vez por corrida basta: el cron solo se dispara una vez al dia.
  let avisosCartera = 0;
  const negociosCartera = await db.user.findMany({
    where: { businessType: "CARTERA" },
    omit: { logo: true, publicCover: true },
  });
  for (const shop of negociosCartera) {
    const hoy = todayIn(shop.timezone);

    const deudas = await db.debt.findMany({
      where: { userId: shop.id, status: "PENDIENTE" },
      include: { payments: { select: { amount: true } } },
    });

    const filas: { nombre: string; monto: number; atrasada: boolean }[] = [];
    for (const deuda of deudas) {
      if (saldo(deuda) <= 0) continue;
      const plan = planDeDeuda(deuda);
      if (plan.length === 0) continue;

      const est = estadoPrestamo(plan, abonado(deuda), hoy);
      if (est.atraso > 0) {
        filas.push({ nombre: deuda.clientName, monto: est.atraso, atrasada: true });
      } else if (est.tocaHoy) {
        filas.push({ nombre: deuda.clientName, monto: est.montoDeHoy, atrasada: false });
      }
    }

    if (filas.length === 0) continue;

    filas.sort((a, b) => Number(b.atrasada) - Number(a.atrasada) || b.monto - a.monto);
    const total = filas.reduce((s, f) => s + f.monto, 0);
    const lineas = filas
      .slice(0, 20)
      .map((f) => "- " + f.nombre + ": " + money(f.monto, shop.currency) + (f.atrasada ? " (atrasado)" : ""));

    await avisarAlAdministrador(shop, {
      asunto:
        "Hoy te toca cobrar a " + filas.length + (filas.length === 1 ? " persona" : " personas"),
      texto:
        "Hoy tienes " +
        filas.length +
        (filas.length === 1 ? " persona" : " personas") +
        " por cobrar, en total " +
        money(total, shop.currency) +
        ".\n\n" +
        lineas.join("\n"),
      ruta: "/panel/cartera",
    });
    avisosCartera += 1;
  }

  // Los mensajes programados del CRM que ya llegaron a su hora.
  const crm = await enviarProgramados({ limite: 1000 });

  // Las facturas autorizadas que esperan respuesta o fallaron por conexion.
  const facturas = await reintentarFacturas(50);

  // El recorrido del personal no se guarda para siempre.
  const ubicacionesBorradas = await borrarUbicacionesViejas();

  // Las cuentas con el pago vencido y sin dias de gracia se suspenden.
  const suspendidasPorPago = await suspenderVencidas();

  return Response.json({
    crm,
    facturas,
    ubicacionesBorradas,
    suspendidasPorPago,
    negocios: negocios.length,
    turnos: { enviados, fallidos, sinConfigurar },
    cartera: { cobros, avisosDueno: avisosCartera },
  });
}
