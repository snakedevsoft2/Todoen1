"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { anotarNovedad } from "@/lib/novedades-cita";
import { buildSlots, endTimeFor } from "@/lib/slots";
import { pretty12h, shortDay, str, texto } from "@/lib/format";
import { anotarActividad } from "@/lib/actividad";

export type EditarCitaState = { error?: string; ok?: string } | undefined;

/**
 * La dueña cambia una cita desde la Agenda (lo pidio MB Nails): los datos de
 * la clienta, el servicio, el dia, la hora y la manicurista que la atiende.
 * A diferencia de updateAppointmentAction, dice que paso: si la hora esta
 * ocupada, si la persona no existe, si ya se cobro.
 */
export async function editarCitaAction(_prev: EditarCitaState, formData: FormData): Promise<EditarCitaState> {
  const { user, staff: yo } = await requireOwner();
  const cita = await db.appointment.findFirst({
    where: { id: str(formData.get("id")), userId: user.id },
    include: { sale: { select: { id: true } } },
  });
  if (!cita) return { error: "No encontramos esa cita." };
  if (cita.sale) return { error: "Esa cita ya se cobró: no se puede mover." };

  const clientName = texto(formData.get("clientName"), 80);
  const clientPhone = texto(formData.get("clientPhone"), 40);
  const day = str(formData.get("day"));
  const startTime = str(formData.get("startTime"));
  if (!clientName) return { error: "Escribe el nombre de la clienta." };
  if (!isValidDay(day)) return { error: "Escoge el día." };
  if (!buildSlots(user).includes(startTime)) return { error: "Escoge una de las horas de la agenda." };

  const persona = await db.staff.findFirst({
    where: { id: str(formData.get("staffId")), userId: user.id, active: true, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!persona) return { error: "Escoge quién la atiende." };

  const serviceId = str(formData.get("serviceId"));
  const servicio = serviceId
    ? await db.service.findFirst({ where: { id: serviceId, userId: user.id }, select: { id: true, name: true, price: true, durationMin: true } })
    : null;
  if (serviceId && !servicio) return { error: "Ese servicio ya no está en la lista." };

  const ocupada = await db.appointment.findFirst({
    where: { userId: user.id, staffId: persona.id, day, startTime, status: { not: "CANCELADO" }, id: { not: cita.id } },
    select: { clientName: true },
  });
  if (ocupada) return { error: persona.name + " ya tiene la cita de " + ocupada.clientName + " a esa hora." };

  const duracion = servicio?.durationMin ?? (await db.service.findFirst({ where: { id: cita.serviceId ?? "" }, select: { durationMin: true } }))?.durationMin;
  try {
    await db.appointment.update({
      where: { id: cita.id },
      data: {
        clientName,
        clientPhone: clientPhone || "-",
        day,
        startTime,
        endTime: endTimeFor(startTime, duracion ?? user.slotMinutes),
        staffId: persona.id,
        staffName: persona.name,
        ...(servicio ? { serviceId: servicio.id, serviceName: servicio.name, price: servicio.price } : {}),
        notes: texto(formData.get("notes"), 300) || null,
        // Si no habia venido y se movio, vuelve a quedar por atender.
        ...(cita.status === "NO_ASISTIO" ? { status: "PENDIENTE" as const } : {}),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Esa hora tiene una cita cancelada de " + persona.name + " que la ocupa. Bórrala o escoge otra hora." };
    }
    throw e;
  }

  // Si cambio el dia o la hora, cuenta como reprogramada (sin avisarle a ella misma).
  if (day !== cita.day || startTime !== cita.startTime) {
    await anotarNovedad(
      user,
      { id: yo.id, name: yo.name, esDuena: true },
      { id: cita.id, clientName, serviceName: servicio?.name ?? cita.serviceName },
      { kind: "REPROGRAMADA", fromDay: cita.day, fromTime: cita.startTime, toDay: day, toTime: startTime },
      todayIn(user.timezone)
    );
  }

  const cuando = shortDay(day) + " " + pretty12h(startTime);
  await anotarActividad({ user, staff: yo }, { tipo: "turno", detalle: "Cambió la cita de " + clientName + ": " + cuando + " con " + persona.name });
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/mis-citas");
  revalidatePath("/panel");
  return { ok: "Guardado: " + clientName + " el " + cuando + " con " + persona.name + "." };
}
