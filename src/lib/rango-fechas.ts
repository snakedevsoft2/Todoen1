import { addDays, isValidDay } from "./dates";

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
