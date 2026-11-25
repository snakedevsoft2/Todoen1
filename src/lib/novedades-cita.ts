import type { AppointmentEventKind, AppointmentStatus } from "@prisma/client";
import { db } from "./db";
import { addDays, dayIn, timeIn } from "./dates";
import { pretty12h } from "./format";
import { avisarAlDueno, type AvisoPush } from "./push";

/**
 * Las novedades de una cita (lo pidio MB Nails, ver lib/mb-nails.ts): la
 * clienta llego, no llego o le cambiaron el dia o la hora.
 *
 * La manicurista solo marca eso en SUS citas; cada cosa queda anotada aqui y
 * le llega a la dueña al celular. La dueña lo ve en la Agenda (por cita y en
 * la lista de novedades) y en su inicio, con cuantas se perdieron y cuantas
 * se reprogramaron.
 */

export type Novedad = {
  kind: AppointmentEventKind;
  staffName: string;
  clientName: string;
  serviceName: string;
  fromDay: string;
  fromTime: string;
  toDay?: string | null;
  toTime?: string | null;
};

/** Lo que la manicurista puede marcar de una cita, segun como esta y la hora. */
export function queSePuedeMarcar(
  cita: { status: AppointmentStatus; day: string; startTime: string; cobrada?: boolean },
  hoy: string
): { llego: boolean; noLlego: boolean; cambiarHora: boolean } {
  const abierta = !cita.cobrada && (cita.status === "PENDIENTE" || cita.status === "CONFIRMADO" || cita.status === "NO_ASISTIO");
  return {
    // "Sí llegó" tambien corrige un "No llegó" marcado por error.
    llego: abierta && cita.day <= hoy,
    // Antes de la hora no se sabe; el servidor ademas mira la hora de hoy.
    noLlego: abierta && cita.status !== "NO_ASISTIO" && cita.day <= hoy,
    cambiarHora: abierta,
  };
}

/** "No llegó" solo desde la hora de la cita: antes todavia puede llegar. */
export function yaEsLaHora(cita: { day: string; startTime: string }, hoy: string, ahora: string): boolean {
  return cita.day < hoy || (cita.day === hoy && cita.startTime <= ahora);
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "hoy 3:00 pm", "mañana 9:30 am", "ayer 4:00 pm" o "jue 27 nov 3:00 pm". */
export function cuandoCita(day: string, time: string, hoy: string): string {
  const hora = pretty12h(time);
  if (day === hoy) return "hoy " + hora;
  if (day === addDays(hoy, 1)) return "mañana " + hora;
  if (day === addDays(hoy, -1)) return "ayer " + hora;
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day + " " + hora;
  const semana = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return DIAS[semana] + " " + d + " " + MESES[m - 1] + " " + hora;
}

/** Lo que dice la notificacion de la dueña. */
export function avisoDeNovedad(n: Novedad, hoy: string): { title: string; body: string } {
  const antes = cuandoCita(n.fromDay, n.fromTime, hoy);
  if (n.kind === "LLEGO") {
    return { title: n.clientName + " llegó a su cita", body: antes + " · " + n.serviceName + " · con " + n.staffName };
  }
  if (n.kind === "NO_LLEGO") {
    return { title: n.clientName + " no llegó", body: "Cita de " + antes + " · " + n.serviceName + " · marcó " + n.staffName };
  }
  const ahora = n.toDay && n.toTime ? cuandoCita(n.toDay, n.toTime, hoy) : "otra hora";
  return { title: n.staffName + " cambió la cita de " + n.clientName, body: "Antes " + antes + " → ahora " + ahora + " · " + n.serviceName };
}

/** La misma novedad en una linea, para la lista de la dueña. */
export function lineaDeNovedad(n: Novedad, hoy: string): string {
  const antes = cuandoCita(n.fromDay, n.fromTime, hoy);
  if (n.kind === "LLEGO") return n.staffName + " marcó que llegó " + n.clientName + " (cita de " + antes + ")";
  if (n.kind === "NO_LLEGO") return n.staffName + " marcó que " + n.clientName + " no llegó (cita de " + antes + ")";
  const ahora = n.toDay && n.toTime ? cuandoCita(n.toDay, n.toTime, hoy) : "otra hora";
  return n.staffName + " cambió la cita de " + n.clientName + ": de " + antes + " a " + ahora;
}

/**
 * Anota la novedad. Si la marco una manicurista, devuelve el aviso para la
 * dueña (la accion lo manda con after(), sin hacerla esperar); si fue la
 * dueña, null. Nunca lanza: la cita ya quedo cambiada y eso es lo que importa.
 */
export async function anotarNovedad(
  user: { id: string },
  quien: { id: string; name: string; esDuena: boolean },
  cita: { id: string; clientName: string; serviceName: string },
  n: { kind: AppointmentEventKind; fromDay: string; fromTime: string; toDay?: string; toTime?: string },
  hoy: string
): Promise<AvisoPush | null> {
  const novedad: Novedad = { ...n, staffName: quien.name, clientName: cita.clientName, serviceName: cita.serviceName };
  try {
    await db.appointmentEvent.create({
      data: {
        userId: user.id,
        appointmentId: cita.id,
        staffId: quien.id,
        staffName: quien.name,
        byOwner: quien.esDuena,
        kind: n.kind,
        clientName: cita.clientName,
        serviceName: cita.serviceName,
        fromDay: n.fromDay,
        fromTime: n.fromTime,
        toDay: n.toDay ?? null,
        toTime: n.toTime ?? null,
      },
    });
  } catch (e) {
    console.error("No se pudo anotar la novedad de la cita", e);
  }
  if (quien.esDuena) return null;
  return { ...avisoDeNovedad(novedad, hoy), url: "/panel/turnos?d=" + (n.toDay ?? n.fromDay) };
}

/** Manda el aviso a la dueña. Para usar dentro de after(). */
export function avisarNovedad(userId: string, aviso: AvisoPush | null): Promise<void> {
  return aviso ? avisarAlDueno(userId, aviso).then(() => undefined) : Promise.resolve();
}

/** Cita nueva desde la reserva en linea (o el agente), para la dueña. */
export function avisoDeCitaNueva(
  cita: { clientName: string; serviceName: string; staffName: string | null; day: string; startTime: string },
  hoy: string
): AvisoPush {
  return {
    title: "Cita nueva: " + cita.clientName,
    body: [cuandoCita(cita.day, cita.startTime, hoy), cita.serviceName, cita.staffName ? "con " + cita.staffName : null]
      .filter(Boolean)
      .join(" · "),
    url: "/panel/turnos?d=" + cita.day,
  };
}

/** Las cuentas del resumen en palabras: "2 citas · 1 no llegó · 0 reprogramadas". */
export function resumenEnPalabras(
  r: { citas?: number; llegaron?: number; perdidas: number; reprogramadas: number; canceladas?: number }
): string {
  const de = (n: number, uno: string, varios: string) => n + " " + (n === 1 ? uno : varios);
  return [
    r.citas === undefined ? null : de(r.citas, "cita", "citas"),
    r.llegaron === undefined ? null : de(r.llegaron, "llegó", "llegaron"),
    de(r.perdidas, "no llegó", "no llegaron"),
    de(r.reprogramadas, "reprogramada", "reprogramadas"),
    r.canceladas === undefined ? null : de(r.canceladas, "cancelada", "canceladas"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** La novedad dentro de la cita misma, en la Agenda: ya se sabe de quien es. */
export function etiquetaEnCita(n: Novedad, hoy: string): string {
  if (n.kind === "LLEGO") return "Llegó · marcó " + n.staffName;
  if (n.kind === "NO_LLEGO") return "No llegó · marcó " + n.staffName;
  return "Cambiada por " + n.staffName + ": antes " + cuandoCita(n.fromDay, n.fromTime, hoy);
}

/** Cuando paso la novedad, dicho como se habla: "hoy 10:05 am". */
export function cuandoPaso(fecha: Date, zona: string, hoy: string): string {
  return cuandoCita(dayIn(fecha, zona), timeIn(fecha, zona), hoy);
}

/**
 * Las citas entre dos dias (ambos incluidos): cuantas hubo, cuantas llegaron,
 * cuantas se perdieron (no llego), cuantas se reprogramaron y cuantas se
 * cancelaron. Reprogramadas son las que tenian uno de esos dias y se movieron,
 * cada cita una vez aunque la movieran dos veces.
 */
export async function resumenDeCitas(userId: string, desde: string, hasta: string, staffId?: string) {
  const [porEstado, movidas] = await Promise.all([
    db.appointment.groupBy({
      by: ["status"],
      where: { userId, day: { gte: desde, lte: hasta }, ...(staffId ? { staffId } : {}) },
      _count: { _all: true },
    }),
    db.appointmentEvent.findMany({
      where: {
        userId,
        kind: "REPROGRAMADA",
        fromDay: { gte: desde, lte: hasta },
        ...(staffId ? { appointment: { is: { staffId } } } : {}),
      },
      distinct: ["appointmentId"],
      select: { appointmentId: true },
    }),
  ]);
  const de = (s: AppointmentStatus) => porEstado.find((g) => g.status === s)?._count._all ?? 0;
  const canceladas = de("CANCELADO");
  const total = porEstado.reduce((s, g) => s + g._count._all, 0);
  return { citas: total - canceladas, llegaron: de("ATENDIDO"), perdidas: de("NO_ASISTIO"), reprogramadas: movidas.length, canceladas };
}

/**
 * Las ultimas novedades que marcaron las manicuristas (no lo que movio la
 * dueña), para la lista de la Agenda y del inicio.
 */
export function novedadesRecientes(userId: string, desde: Date, cuantas: number) {
  return db.appointmentEvent.findMany({
    where: { userId, byOwner: false, createdAt: { gte: desde } },
    orderBy: { createdAt: "desc" },
    take: cuantas,
    select: {
      id: true,
      kind: true,
      staffName: true,
      clientName: true,
      serviceName: true,
      fromDay: true,
      fromTime: true,
      toDay: true,
      toTime: true,
      createdAt: true,
    },
  });
}

export type NovedadReciente = Awaited<ReturnType<typeof novedadesRecientes>>[number];
