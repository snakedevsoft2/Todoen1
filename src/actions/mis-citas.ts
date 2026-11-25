"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { esManicuristaDeMbNails } from "@/lib/mb-nails";
import { isValidDay, timeIn, todayIn } from "@/lib/dates";
import { buildSlots, endTimeFor, isWorkDay } from "@/lib/slots";
import { str } from "@/lib/format";
import { anotarActividad } from "@/lib/actividad";
import { anotarNovedad, avisarNovedad, cuandoCita, queSePuedeMarcar, yaEsLaHora } from "@/lib/novedades-cita";

/**
 * Lo unico que hace la manicurista de MB Nails con sus citas (ver
 * lib/mb-nails.ts): marcar que la clienta llego, que no llego, o cambiarle el
 * dia o la hora. Nada de plata. Solo sobre SUS citas: la cita se busca por
 * negocio Y por quien la atiende, nunca solo por el id. Cada cosa le llega a
 * la dueña al celular y queda en su Agenda (lib/novedades-cita.ts).
 */

export type CitaState = { error?: string; ok?: string } | undefined;

async function sesionDeManicurista() {
  const sesion = await requireSession({ manicuristaOk: true });
  return esManicuristaDeMbNails(sesion.user, sesion.staff) ? sesion : null;
}

function refrescar() {
  revalidatePath("/panel/mis-citas");
  revalidatePath("/panel/turnos");
  revalidatePath("/panel");
}

async function citaSuya(userId: string, staffId: string, formData: FormData) {
  return db.appointment.findFirst({
    where: { id: str(formData.get("id")), userId, staffId },
    include: { sale: { select: { id: true } }, service: { select: { durationMin: true } } },
  });
}

/** Llegó: la clienta esta en el local. La cobra la dueña desde la Agenda. */
export async function llegoAction(_prev: CitaState, formData: FormData): Promise<CitaState> {
  const sesion = await sesionDeManicurista();
  if (!sesion) return { error: "Esto es solo para las manicuristas." };
  const { user, staff } = sesion;

  const cita = await citaSuya(user.id, staff.id, formData);
  if (!cita) return { error: "No encontramos esa cita entre las tuyas." };
  const hoy = todayIn(user.timezone);
  if (cita.status === "CANCELADO") return { error: "Esa cita está cancelada." };
  if (cita.sale || cita.status === "ATENDIDO") return { error: "Esa cita ya estaba marcada como que llegó." };
  if (!queSePuedeMarcar({ ...cita, cobrada: false }, hoy).llego) {
    return { error: "Esa cita es para " + cuandoCita(cita.day, cita.startTime, hoy) + ": márcala ese día." };
  }

  // Solo si sigue como estaba: dos toques seguidos no anotan dos veces.
  const { count } = await db.appointment.updateMany({
    where: { id: cita.id, userId: user.id, staffId: staff.id, status: cita.status },
    data: { status: "ATENDIDO" },
  });
  if (count === 0) return { error: "Esa cita ya estaba marcada." };

  const aviso = await anotarNovedad(
    user,
    { id: staff.id, name: staff.name, esDuena: false },
    cita,
    { kind: "LLEGO", fromDay: cita.day, fromTime: cita.startTime },
    hoy
  );
  after(() => avisarNovedad(user.id, aviso));
  await anotarActividad(
    { user, staff },
    { tipo: "turno", detalle: "Marcó que llegó " + cita.clientName + " a la cita de " + cuandoCita(cita.day, cita.startTime, hoy) }
  );
  refrescar();
  return { ok: "Listo: " + cita.clientName + " llegó. Ya le avisamos a la dueña." };
}

/** No llegó: la clienta no vino a la hora. Queda como cita perdida. */
export async function noLlegoAction(_prev: CitaState, formData: FormData): Promise<CitaState> {
  const sesion = await sesionDeManicurista();
  if (!sesion) return { error: "Esto es solo para las manicuristas." };
  const { user, staff } = sesion;

  const cita = await citaSuya(user.id, staff.id, formData);
  if (!cita) return { error: "No encontramos esa cita entre las tuyas." };
  const hoy = todayIn(user.timezone);
  if (cita.status === "CANCELADO") return { error: "Esa cita está cancelada." };
  if (cita.sale || cita.status === "ATENDIDO") return { error: "Esa cita ya está marcada como que llegó." };
  if (cita.status === "NO_ASISTIO") return { error: "Esa cita ya estaba marcada como que no llegó." };
  if (!yaEsLaHora(cita, hoy, timeIn(new Date(), user.timezone))) {
    return { error: "Todavía no es la hora de la cita (" + cuandoCita(cita.day, cita.startTime, hoy) + "). Márcala si no llega." };
  }

  const { count } = await db.appointment.updateMany({
    where: { id: cita.id, userId: user.id, staffId: staff.id, status: cita.status },
    data: { status: "NO_ASISTIO" },
  });
  if (count === 0) return { error: "Esa cita ya estaba marcada." };

  const aviso = await anotarNovedad(
    user,
    { id: staff.id, name: staff.name, esDuena: false },
    cita,
    { kind: "NO_LLEGO", fromDay: cita.day, fromTime: cita.startTime },
    hoy
  );
  after(() => avisarNovedad(user.id, aviso));
  await anotarActividad(
    { user, staff },
    { tipo: "turno", detalle: "Marcó que " + cita.clientName + " no llegó a la cita de " + cuandoCita(cita.day, cita.startTime, hoy) }
  );
  refrescar();
  return { ok: "Listo: quedó que " + cita.clientName + " no llegó. Ya le avisamos a la dueña." };
}

/** Cambiar hora: la misma cita, otro dia u otra hora, con ella misma. */
export async function reprogramarCitaAction(_prev: CitaState, formData: FormData): Promise<CitaState> {
  const sesion = await sesionDeManicurista();
  if (!sesion) return { error: "Esto es solo para las manicuristas." };
  const { user, staff } = sesion;

  const cita = await citaSuya(user.id, staff.id, formData);
  if (!cita) return { error: "No encontramos esa cita entre las tuyas." };
  if (cita.sale || cita.status === "ATENDIDO") return { error: "Esa clienta ya llegó: la cita no se puede mover." };
  if (cita.status === "CANCELADO") return { error: "Esa cita está cancelada." };

  const day = str(formData.get("day"));
  const startTime = str(formData.get("startTime"));
  const hoy = todayIn(user.timezone);
  if (!isValidDay(day)) return { error: "Escoge el nuevo día." };
  if (day < hoy) return { error: "Ese día ya pasó." };
  if (!buildSlots(user).includes(startTime)) return { error: "Escoge una de las horas de la lista." };
  if (day === hoy && startTime <= timeIn(new Date(), user.timezone)) return { error: "Esa hora de hoy ya pasó." };
  if (!isWorkDay(day, user.workDays)) return { error: "Ese día no se atiende. Escoge otro." };
  if (day === cita.day && startTime === cita.startTime) return { error: "Es la misma fecha y hora que ya tenía." };

  const ocupada = await db.appointment.findFirst({
    where: { userId: user.id, staffId: staff.id, day, startTime, status: { not: "CANCELADO" }, id: { not: cita.id } },
    select: { clientName: true },
  });
  if (ocupada) return { error: "A esa hora ya tienes la cita de " + ocupada.clientName + ". Escoge otra." };

  try {
    await db.appointment.update({
      where: { id: cita.id },
      data: {
        day,
        startTime,
        endTime: endTimeFor(startTime, cita.service?.durationMin ?? user.slotMinutes),
        // Si no vino y se reprogramo, vuelve a quedar por atender.
        ...(cita.status === "NO_ASISTIO" ? { status: "PENDIENTE" as const } : {}),
      },
    });
  } catch (e) {
    // Una cita cancelada sigue ocupando esa hora en la base (es unica por persona y hora).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Esa hora tiene una cita cancelada que la ocupa. Escoge otra o pídele a la dueña que la borre." };
    }
    throw e;
  }

  const aviso = await anotarNovedad(
    user,
    { id: staff.id, name: staff.name, esDuena: false },
    cita,
    { kind: "REPROGRAMADA", fromDay: cita.day, fromTime: cita.startTime, toDay: day, toTime: startTime },
    hoy
  );
  after(() => avisarNovedad(user.id, aviso));
  const antes = cuandoCita(cita.day, cita.startTime, hoy);
  const ahora = cuandoCita(day, startTime, hoy);
  await anotarActividad(
    { user, staff },
    { tipo: "turno", detalle: "Cambió la cita de " + cita.clientName + " (" + cita.serviceName + ") de " + antes + " a " + ahora }
  );
  refrescar();
  return { ok: "Listo: la cita de " + cita.clientName + " quedó para " + ahora + ". Ya le avisamos a la dueña." };
}
