import type { User } from "@prisma/client";
import { db } from "./db";
import { isValidDay, timeIn, todayIn } from "./dates";
import { buildSlots, endTimeFor, isWorkDay } from "./slots";
import { money, pretty12h, prettyDay } from "./format";
import { bookingMessage, isProvider, normalizePhone, sendWhatsapp } from "./whatsapp";
import { anotarCliente, type Origen } from "./clientes";

/**
 * Separar un turno en la agenda.
 *
 * Lo usan la pagina publica de reservas y el agente de IA. Vive en un solo
 * lugar a proposito: si cada uno tuviera sus propias reglas, tarde o temprano
 * el agente dejaria separar un domingo o encima de otro cliente.
 */

export type HorariosDelDia = {
  abierto: boolean;
  motivo?: string;
  /** Horas en "HH:mm" en las que al menos una persona esta libre. */
  libres: string[];
  porPersona: { id: string; name: string; libres: string[] }[];
};

export async function horariosLibres(shop: User, day: string): Promise<HorariosDelDia> {
  const cerrado = (motivo: string): HorariosDelDia => ({ abierto: false, motivo, libres: [], porPersona: [] });
  const today = todayIn(shop.timezone);

  if (shop.businessType !== "BARBERIA") return cerrado("Este negocio no recibe reservas por hora.");
  if (!shop.bookingOpen) return cerrado("Las reservas están cerradas por ahora.");
  if (!isValidDay(day)) return cerrado("Esa fecha no es válida.");
  if (day < today) return cerrado("Esa fecha ya pasó.");
  if (!isWorkDay(day, shop.workDays)) return cerrado("Ese día no atienden.");

  const [team, citas] = await Promise.all([
    db.staff.findMany({
      where: { userId: shop.id, active: true, bookable: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    db.appointment.findMany({
      where: { userId: shop.id, day, status: { not: "CANCELADO" } },
      select: { startTime: true, staffId: true },
    }),
  ]);

  const ahora = day === today ? timeIn(new Date(), shop.timezone) : null;
  const slots = buildSlots(shop).filter((s) => !ahora || s > ahora);

  if (team.length === 0) {
    const tomadas = new Set(citas.map((c) => c.startTime));
    return { abierto: true, libres: slots.filter((s) => !tomadas.has(s)), porPersona: [] };
  }

  const porPersona = team.map((p) => {
    const suyas = new Set(citas.filter((c) => c.staffId === p.id).map((c) => c.startTime));
    return { id: p.id, name: p.name, libres: slots.filter((s) => !suyas.has(s)) };
  });
  const libres = slots.filter((s) => porPersona.some((p) => p.libres.includes(s)));
  return { abierto: true, libres, porPersona };
}

export type DatosReserva = {
  day: string;
  startTime: string;
  serviceId?: string | null;
  staffId?: string | null;
  clientName: string;
  clientPhone: string;
  notes?: string | null;
  wantsReminder: boolean;
};

export type ResultadoReserva =
  | {
      ok: true;
      id: string;
      ref: string;
      serviceName: string;
      staffName: string | null;
      customerId: string | null;
      aviso: string;
      /** Numero del negocio que recibe el aviso, si tiene. */
      destino: string | null;
      /** Si se intento mandar el aviso (para refrescar la pantalla de avisos). */
      avisoIntentado: boolean;
    }
  | { ok: false; error: string };

export async function reservarTurno(shop: User, d: DatosReserva, origen: Origen): Promise<ResultadoReserva> {
  const fallo = (error: string): ResultadoReserva => ({ ok: false, error });
  const clientName = d.clientName.trim().slice(0, 200);
  const clientPhone = d.clientPhone.trim().slice(0, 40);
  const { day, startTime } = d;

  // La comprobacion va aqui y no solo en la pagina: el servicio es opcional,
  // asi que sin esto se podria crear un turno "por definir" en un restaurante.
  if (shop.businessType !== "BARBERIA") return fallo("Este negocio no recibe reservas por hora.");
  if (!shop.bookingOpen) return fallo("Las reservas estan cerradas por ahora.");
  if (!clientName) return fallo("Escribe tu nombre.");
  if (clientPhone.replace(/\D/g, "").length < 7) return fallo("Escribe un telefono valido.");
  if (!isValidDay(day)) return fallo("Elige una fecha valida.");

  const today = todayIn(shop.timezone);
  if (day < today) return fallo("No puedes reservar en una fecha que ya paso.");
  if (!isWorkDay(day, shop.workDays)) return fallo("Ese dia no atendemos. Elige otro dia.");

  const slots = buildSlots(shop);
  if (!slots.includes(startTime)) return fallo("Esa hora no esta disponible.");
  if (day === today && startTime <= timeIn(new Date(), shop.timezone)) {
    return fallo("Esa hora ya paso. Elige una mas tarde.");
  }

  const service = d.serviceId
    ? await db.service.findFirst({ where: { id: d.serviceId, userId: shop.id, active: true } })
    : null;
  if (d.serviceId && !service) return fallo("Elige un servicio de la lista.");

  // Quien atiende. El cliente puede elegir barbero o dejar "el que este libre".
  const team = await db.staff.findMany({
    where: { userId: shop.id, active: true, bookable: true },
    orderBy: { createdAt: "asc" },
  });

  const ocupados = await db.appointment.findMany({
    where: { userId: shop.id, day, startTime, status: { not: "CANCELADO" } },
    select: { staffId: true },
  });
  const ocupadosIds = new Set(ocupados.map((a) => a.staffId));

  let staff = null as (typeof team)[number] | null;
  if (team.length > 0) {
    if (d.staffId) {
      staff = team.find((t) => t.id === d.staffId) ?? null;
      if (!staff) return fallo("Elige un barbero de la lista.");
      if (ocupadosIds.has(staff.id)) {
        return fallo("Ese barbero ya tiene turno a esa hora. Elige otra hora u otro barbero.");
      }
    } else {
      staff = team.find((t) => !ocupadosIds.has(t.id)) ?? null;
      if (!staff) return fallo("Alguien acaba de tomar esa hora. Elige otra.");
    }
  } else if (ocupados.length > 0) {
    return fallo("Alguien acaba de tomar esa hora. Elige otra.");
  }

  let created;
  try {
    created = await db.appointment.create({
      data: {
        userId: shop.id,
        serviceId: service?.id ?? null,
        serviceName: service?.name ?? "Servicio por definir",
        staffId: staff?.id ?? null,
        staffName: staff?.name ?? null,
        price: service?.price ?? 0,
        clientName,
        clientPhone,
        day,
        startTime,
        endTime: endTimeFor(startTime, service?.durationMin ?? shop.slotMinutes),
        notes: d.notes?.trim().slice(0, 200) || null,
        wantsReminder: d.wantsReminder,
        status: "PENDIENTE",
      },
    });
  } catch {
    return fallo("Esa hora ya fue tomada. Elige otra.");
  }

  // Quien reserva queda con su ficha de cliente, sin que nadie la escriba.
  const customerId = await anotarCliente(shop.id, { name: clientName, phone: clientPhone, source: origen });

  const aviso = bookingMessage({
    businessName: shop.businessName,
    clientName,
    clientPhone,
    serviceName: created.serviceName,
    price: money(created.price, shop.currency),
    prettyDay: prettyDay(day),
    time: pretty12h(startTime),
    staffName: created.staffName,
    notes: created.notes,
  });

  // El aviso nunca puede tumbar la reserva: si falla, lo dejamos anotado.
  const destino = normalizePhone(shop.whatsappNumber);
  const avisoIntentado = Boolean(shop.notifyOnBooking && destino);
  if (avisoIntentado && destino) {
    const provider = isProvider(shop.whatsappProvider) ? shop.whatsappProvider : "enlace";
    let resultado;
    try {
      resultado = await sendWhatsapp({
        provider,
        to: destino,
        message: aviso,
        apiKey: shop.whatsappApiKey,
        phoneId: shop.whatsappPhoneId,
      });
    } catch {
      resultado = { status: "FALLIDO" as const, detail: "Error inesperado al enviar el aviso." };
    }
    try {
      await db.notification.create({
        data: {
          userId: shop.id,
          provider,
          toNumber: destino,
          message: aviso,
          status: resultado.status,
          detail: resultado.detail,
          appointmentId: created.id,
        },
      });
    } catch {
      // Si ni siquiera se puede guardar el historial, seguimos: el turno ya quedo.
    }
  }

  return {
    ok: true,
    id: created.id,
    ref: created.id.slice(-6).toUpperCase(),
    serviceName: created.serviceName,
    staffName: created.staffName,
    customerId,
    aviso,
    destino,
    avisoIntentado,
  };
}
