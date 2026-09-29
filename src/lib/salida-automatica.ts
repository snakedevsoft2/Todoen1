import { db } from "./db";
import { addDays, dayIn, inicioDelDiaEn } from "./dates";

/**
 * La salida que la persona no marco.
 *
 * En el lavadero, si alguien marco entrada y se fue sin marcar salida, al
 * cambiar el dia la aplicacion le pone la salida a las 11:59:59 p. m. del dia
 * en que entro. Queda como un marcaje mas pero con `automatic`, para que el
 * dueño vea que no la marco la persona (y no se confunda con un marcaje sin
 * señal). Si despues llega la salida de verdad que estaba guardada en el
 * telefono, la automatica se anula sola (ver anularAutomaticaAlLlegarLaReal).
 *
 * Solo el lavadero: en el gestor de asistencia hay turnos de noche que salen
 * al otro dia, y cerrarles la jornada a medianoche les partiria el turno.
 *
 * Se corre desde el cron de medianoche y, por si el cron no alcanzo, cada vez
 * que alguien abre Marcar, Mis lavados o la Planilla. La llave "auto-<id de la
 * entrada>" hace que correrlo dos veces no ponga dos salidas.
 */

/** Cuantos dias hacia atras se revisan: una entrada mas vieja ya se cerro antes. */
const DIAS_ATRAS = 7;

export function aplicaSalidaAutomatica(businessType: string): boolean {
  return businessType === "LAVADERO";
}

/** El ultimo instante del dia `day` en la zona del negocio. */
export function finDelDia(day: string, timezone: string): Date {
  return new Date(inicioDelDiaEn(addDays(day, 1), timezone).getTime() - 1000);
}

export async function cerrarSalidasOlvidadas(
  user: { id: string; timezone: string; businessType: string },
  ahora = new Date()
): Promise<number> {
  if (!aplicaSalidaAutomatica(user.businessType)) return 0;

  const hoy = dayIn(ahora, user.timezone);
  const inicioDeHoy = inicioDelDiaEn(hoy, user.timezone);
  if (inicioDeHoy > ahora) return 0;

  const marcajes = await db.attendance.findMany({
    where: {
      userId: user.id,
      voidedAt: null,
      markedAt: { gte: inicioDelDiaEn(addDays(hoy, -DIAS_ATRAS), user.timezone) },
    },
    orderBy: [{ staffId: "asc" }, { markedAt: "asc" }],
    select: { id: true, staffId: true, kind: true, markedAt: true, siteId: true },
  });

  const salidas = [];
  for (let i = 0; i < marcajes.length; i++) {
    const m = marcajes[i];
    // Solo las entradas de un dia que ya termino. La de hoy todavia puede
    // marcar su salida.
    if (m.kind !== "ENTRADA" || m.markedAt >= inicioDeHoy) continue;
    const siguiente = marcajes[i + 1];
    if (siguiente && siguiente.staffId === m.staffId && siguiente.kind === "SALIDA") continue;

    salidas.push({
      userId: user.id,
      staffId: m.staffId,
      siteId: m.siteId,
      kind: "SALIDA" as const,
      markedAt: finDelDia(dayIn(m.markedAt, user.timezone), user.timezone),
      clientKey: "auto-" + m.id,
      automatic: true,
      note: "No marcó la salida: la puso la aplicación al cambiar el día.",
    });
  }

  if (salidas.length === 0) return 0;
  const r = await db.attendance.createMany({ data: salidas, skipDuplicates: true });
  return r.count;
}

/** Para el cron: todos los lavaderos. */
export async function cerrarSalidasOlvidadasDeTodos(ahora = new Date()) {
  const negocios = await db.user.findMany({
    where: { businessType: "LAVADERO" },
    select: { id: true, timezone: true, businessType: true },
  });
  let cerradas = 0;
  for (const n of negocios) cerradas += await cerrarSalidasOlvidadas(n, ahora);
  return cerradas;
}

/**
 * Llego la salida que la persona si marco (viajo en la cola del telefono sin
 * señal, o la marco pasada la medianoche): la automatica de esa misma
 * jornada sobra y se anula, dejando el motivo, como cualquier anulacion.
 */
export async function anularAutomaticaAlLlegarLaReal(staffId: string, salidaReal: Date) {
  const entrada = await db.attendance.findFirst({
    where: { staffId, voidedAt: null, kind: "ENTRADA", markedAt: { lt: salidaReal } },
    orderBy: { markedAt: "desc" },
    select: { markedAt: true },
  });
  if (!entrada) return 0;
  const r = await db.attendance.updateMany({
    where: {
      staffId,
      automatic: true,
      voidedAt: null,
      markedAt: { gt: entrada.markedAt, lte: new Date(entrada.markedAt.getTime() + 2 * 24 * 60 * 60 * 1000) },
    },
    data: { voidedAt: new Date(), voidedReason: "Llegó la salida que marcó la persona." },
  });
  return r.count;
}
