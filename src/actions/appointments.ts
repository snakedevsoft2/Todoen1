"use server";

import { revalidatePath } from "next/cache";
import type { AppointmentStatus, PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { anotarCliente } from "@/lib/clientes";
import { reservarTurno } from "@/lib/reservas";
import { requireOwner, requireSession } from "@/lib/auth";
import { isValidDay } from "@/lib/dates";
import { endTimeFor } from "@/lib/slots";
import { parseIntSafe, str } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { anotarActividad } from "@/lib/actividad";
import { nextReceiptSeq } from "@/lib/receipt-seq";

export type BookingState =
  | {
      error?: string;
      ok?: string;
      ref?: string;
      waLink?: string | null;
      /** Barbero que quedo atendiendo, para confirmarselo al cliente. */
      staffName?: string | null;
    }
  | undefined;

const VALID_STATUS: AppointmentStatus[] = [
  "PENDIENTE",
  "CONFIRMADO",
  "ATENDIDO",
  "CANCELADO",
  "NO_ASISTIO",
];

const VALID_PAYMENTS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];

function readPayment(value: FormDataEntryValue | null): PaymentMethod {
  const v = String(value ?? "EFECTIVO") as PaymentMethod;
  return VALID_PAYMENTS.includes(v) ? v : "EFECTIVO";
}

/**
 * Decide que barbero atiende un turno.
 * Primero el que se pidio, si no el que esta usando la aplicacion, y si no el
 * primero del equipo. Siempre se comprueba que sea de ESTE negocio.
 */
async function pickStaff(userId: string, requested: string, fallbackId?: string | null) {
  if (requested) {
    return db.staff.findFirst({ where: { id: requested, userId, active: true } });
  }
  if (fallbackId) {
    const mine = await db.staff.findFirst({ where: { id: fallbackId, userId, active: true } });
    if (mine) return mine;
  }
  return db.staff.findFirst({ where: { userId, active: true }, orderBy: { createdAt: "asc" } });
}

/** Turno ya ocupado para ese barbero, a esa hora, ese dia. */
async function slotTaken(userId: string, staffId: string | null, day: string, startTime: string, exceptId?: string) {
  return db.appointment.findFirst({
    where: {
      userId,
      staffId,
      day,
      startTime,
      status: { not: "CANCELADO" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
}

/** Reserva publica: la hace el cliente desde /reservar/[slug], sin necesidad de cuenta. */
export async function bookAppointmentAction(
  _prev: BookingState,
  formData: FormData
): Promise<BookingState> {
  const slug = str(formData.get("slug"));
  const shop = await db.user.findUnique({ where: { slug }, omit: { logo: true, publicCover: true } });
  if (!shop) return { error: "No encontramos este negocio." };

  // Las reglas viven en lib/reservas.ts: el agente de IA separa turnos con
  // exactamente las mismas.
  const r = await reservarTurno(
    shop,
    {
      day: str(formData.get("day")),
      startTime: str(formData.get("startTime")),
      serviceId: str(formData.get("serviceId")) || null,
      staffId: str(formData.get("staffId")) || null,
      clientName: str(formData.get("clientName")),
      clientPhone: str(formData.get("clientPhone")),
      notes: str(formData.get("notes")) || null,
      // Lo eligio el cliente al reservar. Si no manda el campo, no quiere.
      wantsReminder: formData.get("wantsReminder") === "on",
    },
    "reserva"
  );
  if (!r.ok) return { error: r.error };

  if (r.avisoIntentado) revalidatePath("/panel/avisos");
  revalidatePath("/reservar/" + slug);
  revalidatePath("/panel/turnos");
  revalidatePath("/panel");
  return {
    ok: "Turno separado",
    ref: r.ref,
    waLink: r.destino ? waLink(r.destino, r.aviso) : null,
    staffName: r.staffName,
  };
}

/** El barbero agrega un turno a mano desde el panel (cliente que llego sin reserva). */
export async function createAppointmentAction(
  _prev: BookingState,
  formData: FormData
): Promise<BookingState> {
  const { user, staff: me } = await requireSession();
  const day = str(formData.get("day"));
  const startTime = str(formData.get("startTime"));
  const serviceId = str(formData.get("serviceId"));
  const clientName = str(formData.get("clientName"));
  const clientPhone = str(formData.get("clientPhone"), "-");
  const notes = str(formData.get("notes"));

  if (!clientName) return { error: "Escribe el nombre del cliente." };
  if (!isValidDay(day)) return { error: "Elige una fecha valida." };
  if (!/^\d{2}:\d{2}$/.test(startTime)) return { error: "Elige una hora valida." };

  const service = serviceId
    ? await db.service.findFirst({ where: { id: serviceId, userId: user.id } })
    : null;

  // Por defecto el turno queda a nombre de quien esta usando la aplicacion.
  const staff = await pickStaff(user.id, str(formData.get("staffId")), me.id);

  const taken = await slotTaken(user.id, staff?.id ?? null, day, startTime);
  if (taken) {
    return {
      error:
        (staff ? staff.name + " ya tiene" : "Ya tienes") + " un turno a las " + startTime + ".",
    };
  }

  try {
    await db.appointment.create({
      data: {
        userId: user.id,
        serviceId: service?.id ?? null,
        serviceName: service?.name ?? "Servicio por definir",
        staffId: staff?.id ?? null,
        staffName: staff?.name ?? null,
        price: service?.price ?? 0,
        clientName,
        clientPhone,
        day,
        startTime,
        endTime: endTimeFor(startTime, service?.durationMin ?? user.slotMinutes),
        notes: notes || null,
        status: "CONFIRMADO",
      },
    });
  } catch {
    return { error: "No se pudo guardar. Revisa que la hora este libre." };
  }

  await anotarCliente(user.id, {
    name: clientName,
    phone: clientPhone === "-" ? null : clientPhone,
    source: "turno",
  });

  await anotarActividad(
    { user, staff: me },
    { tipo: "turno", detalle: "Agendó un turno de " + clientName + " el " + day + " a las " + startTime }
  );

  revalidatePath("/panel/turnos");
  revalidatePath("/panel");
  return { ok: staff ? "Turno agregado para " + staff.name + "." : "Turno agregado." };
}

export async function setAppointmentStatusAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const status = str(formData.get("status")) as AppointmentStatus;
  if (!VALID_STATUS.includes(status)) return;
  await db.appointment.updateMany({ where: { id, userId: user.id }, data: { status } });
  revalidatePath("/panel/turnos");
  revalidatePath("/panel");
}

export async function updateAppointmentAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const appointment = await db.appointment.findFirst({ where: { id, userId: user.id } });
  if (!appointment) return;

  const serviceId = str(formData.get("serviceId"));
  const service = serviceId
    ? await db.service.findFirst({ where: { id: serviceId, userId: user.id } })
    : null;
  const startTime = str(formData.get("startTime"), appointment.startTime);
  const day = str(formData.get("day"), appointment.day);
  const staff = await pickStaff(user.id, str(formData.get("staffId")), appointment.staffId);
  const staffId = staff?.id ?? null;

  if (day !== appointment.day || startTime !== appointment.startTime || staffId !== appointment.staffId) {
    const clash = await slotTaken(user.id, staffId, day, startTime, appointment.id);
    if (clash) return;
  }

  await db.appointment.update({
    where: { id: appointment.id },
    data: {
      clientName: str(formData.get("clientName"), appointment.clientName),
      clientPhone: str(formData.get("clientPhone"), appointment.clientPhone),
      day,
      startTime,
      staffId,
      staffName: staff?.name ?? appointment.staffName,
      endTime: endTimeFor(startTime, service?.durationMin ?? user.slotMinutes),
      serviceId: service?.id ?? appointment.serviceId,
      serviceName: service?.name ?? appointment.serviceName,
      price: service ? service.price : appointment.price,
      notes: str(formData.get("notes")) || null,
    },
  });
  revalidatePath("/panel/turnos");
}

/** Le pasa el turno a otro barbero desde la agenda. */
export async function setAppointmentStaffAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const appointment = await db.appointment.findFirst({ where: { id, userId: user.id } });
  if (!appointment) return;

  const staff = await db.staff.findFirst({
    where: { id: str(formData.get("staffId")), userId: user.id, active: true },
  });
  if (!staff || staff.id === appointment.staffId) return;

  // Si el otro barbero ya tiene esa hora ocupada, no se mueve.
  const clash = await slotTaken(
    user.id,
    staff.id,
    appointment.day,
    appointment.startTime,
    appointment.id
  );
  if (clash) return;

  await db.$transaction([
    db.appointment.update({
      where: { id: appointment.id },
      data: { staffId: staff.id, staffName: staff.name },
    }),
    // La venta de ese turno tambien cambia de dueno, para que la medicion cuadre.
    db.sale.updateMany({
      where: { appointmentId: appointment.id, userId: user.id },
      data: { staffId: staff.id },
    }),
  ]);

  revalidatePath("/panel/turnos");
  revalidatePath("/panel/ventas");
  revalidatePath("/panel/reportes");
  revalidatePath("/panel");
}

export async function deleteAppointmentAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  await db.appointment.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/panel/turnos");
  revalidatePath("/panel");
}

/**
 * Cierra la venta de un turno: lo marca ATENDIDO y registra la plata del dia.
 * Es el boton "cerrar venta" del panel de barberia.
 */
export async function closeAppointmentSaleAction(formData: FormData) {
  const { user, staff } = await requireSession();
  const id = str(formData.get("id"));
  const appointment = await db.appointment.findFirst({
    where: { id, userId: user.id },
    include: { sale: true },
  });
  if (!appointment || appointment.sale) return;

  const amount = Math.max(0, parseIntSafe(formData.get("amount"), appointment.price));
  const paymentMethod = readPayment(formData.get("paymentMethod"));

  await db.$transaction(async (tx) => {
    await tx.sale.create({
      data: {
        userId: user.id,
        day: appointment.day,
        total: amount,
        paymentMethod,
        origin: "TURNO",
        clientName: appointment.clientName,
        staffId: appointment.staffId,
        appointmentId: appointment.id,
        receiptSeq: await nextReceiptSeq(tx, user.id),
        items: {
          create: [
            {
              userId: user.id,
              serviceId: appointment.serviceId,
              name: appointment.serviceName,
              unitPrice: amount,
              qty: 1,
            },
          ],
        },
      },
    });
    await tx.appointment.update({ where: { id: appointment.id }, data: { status: "ATENDIDO" } });
  });
  await anotarActividad({ user, staff }, { tipo: "cobro", detalle: "Cobró el turno de " + appointment.clientName, monto: amount });

  revalidatePath("/panel/turnos");
  revalidatePath("/panel/ventas");
  revalidatePath("/panel");
}
