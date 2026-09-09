import { db } from "./db";
import { addDays, todayIn } from "./dates";

/**
 * Recordatorios de turno.
 *
 * Se le manda al cliente el dia antes, y solo si el lo pidio al reservar. La
 * lista se arma aqui para que la use tanto la pantalla de Turnos (donde el
 * barbero los manda con un toque) como la tarea automatica.
 */
export type Reminder = Awaited<ReturnType<typeof remindersForTomorrow>>[number];

/**
 * Los recordatorios de manana, mandados y sin mandar.
 *
 * Vienen los dos a proposito: el barbero necesita ver cuales ya despacho para
 * saber por donde va, y poder deshacer si marco uno sin querer. Solo los turnos
 * que siguen en pie, claro: a un cancelado no hay que recordarle nada.
 */
export async function remindersForTomorrow(userId: string, timezone: string) {
  const manana = addDays(todayIn(timezone), 1);

  return db.appointment.findMany({
    where: {
      userId,
      day: manana,
      wantsReminder: true,
      status: { in: ["PENDIENTE", "CONFIRMADO"] },
    },
    orderBy: { startTime: "asc" },
    include: { staff: { select: { name: true } } },
  });
}

/** Cuantos hay pendientes, para el aviso del panel. */
export async function countPendingReminders(userId: string, timezone: string): Promise<number> {
  const manana = addDays(todayIn(timezone), 1);
  return db.appointment.count({
    where: {
      userId,
      day: manana,
      wantsReminder: true,
      reminderSentAt: null,
      status: { in: ["PENDIENTE", "CONFIRMADO"] },
    },
  });
}
