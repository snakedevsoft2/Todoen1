import { db } from "./db";
import { addDays, dayIn, inicioDelDiaEn } from "./dates";

/**
 * Una entrada y una salida por jornada.
 *
 * La regla vive en el servidor y se revisa con la hora en que se toco el
 * boton, no con la hora en que llego: un marcaje que viajo horas en la cola
 * del telefono se juzga por el dia en que de verdad se hizo.
 *
 * - ENTRADA: una por dia (en la zona del negocio), y no si hay una entrada
 *   abierta de las ultimas horas sin su salida.
 * - SALIDA: solo si lo ultimo que marco, en las ultimas 20 horas, fue una
 *   entrada. Asi funciona tambien el turno de noche que sale al otro dia.
 *
 * Los marcajes anulados no cuentan: si el administrador anulo una entrada
 * equivocada, la persona puede volver a marcar.
 */
const VENTANA_MS = 20 * 60 * 60 * 1000;

export async function motivoParaRechazar(
  staffId: string,
  timezone: string,
  kind: "ENTRADA" | "SALIDA",
  markedAt: Date
): Promise<string | null> {
  const anterior = await db.attendance.findFirst({
    where: {
      staffId,
      voidedAt: null,
      markedAt: { lt: markedAt, gte: new Date(markedAt.getTime() - VENTANA_MS) },
    },
    orderBy: { markedAt: "desc" },
    select: { kind: true },
  });

  if (kind === "SALIDA") {
    if (anterior?.kind === "ENTRADA") return null;
    return anterior?.kind === "SALIDA"
      ? "Ya marcaste la salida de esa jornada."
      : "Primero marca la entrada.";
  }

  const dia = dayIn(markedAt, timezone);
  const yaEntro = await db.attendance.findFirst({
    where: {
      staffId,
      voidedAt: null,
      kind: "ENTRADA",
      markedAt: { gte: inicioDelDiaEn(dia, timezone), lt: inicioDelDiaEn(addDays(dia, 1), timezone) },
    },
    select: { id: true },
  });
  if (yaEntro) return "Ya marcaste la entrada de ese día. Solo se marca una entrada y una salida por día.";
  if (anterior?.kind === "ENTRADA") return "Tienes una entrada sin salida. Marca primero la salida.";
  return null;
}
