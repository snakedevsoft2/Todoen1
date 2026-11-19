import { addDays, isValidDay, isoWeekday, startOfMonth } from "./dates";

/**
 * Un rango de fechas "desde / hasta" que llega por la direccion de la pagina
 * (lo pidio Chopo Snacks para Gastos).
 *
 * Archivo puro. Lo que se arregla solo, en vez de dar error:
 * - Si viene una sola de las dos fechas, es ese dia.
 * - Si vienen al reves, se dan vuelta.
 * - Mas de un año no: la lista se volveria interminable. Se queda con el
 *   ultimo año hasta la fecha final.
 */
export type RangoFechas = { desde: string; hasta: string; /** Mas de un dia. */ varios: boolean };

const MAX_DIAS = 366;

export function rangoDeFechas(desdeCrudo?: string | null, hastaCrudo?: string | null): RangoFechas | null {
  const d = desdeCrudo && isValidDay(desdeCrudo) ? desdeCrudo : null;
  const h = hastaCrudo && isValidDay(hastaCrudo) ? hastaCrudo : null;
  if (!d && !h) return null;
  let desde = d ?? (h as string);
  let hasta = h ?? (d as string);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1;
  if (dias > MAX_DIAS) desde = addDays(hasta, -(MAX_DIAS - 1));
  return { desde, hasta, varios: desde !== hasta };
}

/* ---- El calendario de rango (un solo calendario: se toca desde y luego hasta) ---- */

/** Lo que va eligiendo la persona en el calendario. */
export type Eleccion = { desde: string | null; hasta: string | null };

/**
 * Tocar un dia: el primer toque es "desde" y el segundo "hasta". Si el
 * segundo cae antes del primero, se dan vuelta. Con las dos ya puestas, un
 * toque nuevo empieza otra vez.
 */
export function tocarDia(e: Eleccion, dia: string): Eleccion {
  if (!e.desde || e.hasta) return { desde: dia, hasta: null };
  return dia < e.desde ? { desde: dia, hasta: e.desde } : { desde: e.desde, hasta: dia };
}

/** Los 42 dias (seis semanas de lunes a domingo) que muestra el mes "YYYY-MM". */
export function diasDelCalendario(mes: string): string[] {
  const primero = mes + "-01";
  const inicio = addDays(primero, -(isoWeekday(primero) - 1));
  return Array.from({ length: 42 }, (_, i) => addDays(inicio, i));
}

/** El mes "YYYY-MM" que queda `delta` meses antes o despues. */
export function mesVecino(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return Math.floor(total / 12) + "-" + String((total % 12) + 1).padStart(2, "0");
}

/** Atajos del calendario, contados desde hoy. */
export function atajosDeRango(hoy: string): { nombre: string; desde: string; hasta: string }[] {
  const inicioMes = startOfMonth(hoy);
  const finMesPasado = addDays(inicioMes, -1);
  return [
    { nombre: "Últimos 7 días", desde: addDays(hoy, -6), hasta: hoy },
    { nombre: "Este mes", desde: inicioMes, hasta: hoy },
    { nombre: "Mes pasado", desde: startOfMonth(finMesPasado), hasta: finMesPasado },
  ];
}
