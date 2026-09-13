import { addDays, isoWeekday, startOfMonth } from "./dates";

/** El periodo de la planilla: un dia, la semana (lunes a domingo) o el mes. */
export type Rango = "dia" | "semana" | "mes";

export function esRango(v: unknown): v is Rango {
  return v === "dia" || v === "semana" || v === "mes";
}

/** Primer y ultimo dia (inclusive) del periodo que contiene a `dia`. */
export function limites(dia: string, rango: Rango): { desde: string; hasta: string } {
  if (rango === "semana") {
    const lunes = addDays(dia, 1 - isoWeekday(dia));
    return { desde: lunes, hasta: addDays(lunes, 6) };
  }
  if (rango === "mes") {
    const inicio = startOfMonth(dia);
    const siguiente = startOfMonth(addDays(inicio, 32));
    return { desde: inicio, hasta: addDays(siguiente, -1) };
  }
  return { desde: dia, hasta: dia };
}
