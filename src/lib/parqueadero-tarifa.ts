import { TOPE_MONEDA, money } from "./format";

/**
 * Cuanto se cobra en el parqueadero por el tiempo que un vehiculo lleva
 * adentro.
 *
 * Vive aparte de lib/parqueadero.ts y sin tocar la base de datos a proposito:
 * la misma cuenta la hace el servidor al cobrar la salida y el celular del
 * cliente en la pagina del QR, que va subiendo minuto a minuto sin volver a
 * preguntarle nada al servidor. Si fueran dos cuentas distintas, el cliente
 * veria un precio y en la caja le cobrarian otro.
 */

export type Tarifa = {
  /** Cuanto vale una hora. 0 = solo se cobra por dia. */
  pricePerHour: number;
  /** Cada cuanto sube el cobro: 60 = por hora empezada, 15 = por cuarto de hora. */
  fractionMinutes: number;
  /** Minutos de cortesia: si sale antes, no paga. */
  graceMinutes: number;
  /** Tope por cada 24 horas. 0 = sin tope. Sin precio por hora, es lo que vale cada dia. */
  pricePerDay: number;
};

const DIA = 24 * 60;

/** Las fracciones que se pueden elegir en la configuracion. */
export const FRACCIONES: { value: number; label: string }[] = [
  { value: 60, label: "Por hora empezada" },
  { value: 30, label: "Por media hora" },
  { value: 15, label: "Por cuarto de hora" },
  { value: 1, label: "Por minuto" },
];

function fraccion(t: Tarifa): number {
  const f = Math.trunc(t.fractionMinutes);
  return f >= 1 && f <= DIA ? f : 60;
}

/**
 * Minutos que lleva adentro, contando el minuto empezado: a los 10 segundos ya
 * es 1 minuto. Asi es como cobra cualquier parqueadero, y es lo que hace que
 * la primera fraccion se vea desde que el carro entra.
 */
export function minutosEntre(desde: Date | string | number, hasta: Date | string | number = Date.now()): number {
  const ms = new Date(hasta).getTime() - new Date(desde).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 60000);
}

/** Lo que cuestan esos minutos por horas o fracciones, sin tope. */
function porTiempo(t: Tarifa, minutos: number): number {
  const f = fraccion(t);
  return Math.round((Math.ceil(minutos / f) * f * t.pricePerHour) / 60);
}

/**
 * Lo que debe un vehiculo que lleva `minutos` adentro.
 *
 * - Dentro de los minutos de cortesia no paga nada.
 * - Con precio por hora: se cobra cada fraccion empezada. Si hay precio por
 *   dia, cada 24 horas completas valen el dia, y lo que sobra se cobra por
 *   horas pero nunca por encima del dia.
 * - Sin precio por hora (solo por dia): cada dia empezado vale el dia.
 */
export function cobroDe(t: Tarifa, minutos: number): number {
  if (!(minutos > 0)) return 0;
  if (t.graceMinutes > 0 && minutos <= t.graceMinutes) return 0;

  let total: number;
  if (t.pricePerHour <= 0) {
    total = Math.ceil(minutos / DIA) * Math.max(0, t.pricePerDay);
  } else if (t.pricePerDay <= 0) {
    total = porTiempo(t, minutos);
  } else {
    const dias = Math.floor(minutos / DIA);
    const resto = minutos - dias * DIA;
    total = dias * t.pricePerDay + (resto > 0 ? Math.min(porTiempo(t, resto), t.pricePerDay) : 0);
  }
  return Math.min(TOPE_MONEDA, Math.max(0, total));
}

/** "45 min", "2 h 5 min", "1 día 3 h". */
export function duracionTexto(minutos: number): string {
  const m = Math.max(0, Math.trunc(minutos));
  const d = Math.floor(m / DIA);
  const h = Math.floor((m % DIA) / 60);
  const min = m % 60;
  const partes: string[] = [];
  if (d > 0) partes.push(d + (d === 1 ? " día" : " días"));
  if (h > 0) partes.push(h + " h");
  if (min > 0 && d === 0) partes.push(min + " min");
  return partes.length ? partes.join(" ") : "0 min";
}

/** Lo minimo que se paga despues de la cortesia: la primera fraccion (o el primer dia). */
export function cobroMinimo(t: Tarifa): number {
  return cobroDe(t, t.graceMinutes + 1);
}

/** Lo maximo que se paga por un dia completo. */
export function cobroMaximoDia(t: Tarifa): number {
  return cobroDe(t, DIA);
}

/**
 * La tarifa explicada en renglones, para el cliente: en la pagina del QR, en
 * el ticket impreso y en la configuracion ("asi lo ve tu cliente").
 */
export function tarifaEnPalabras(t: Tarifa, currency: string): string[] {
  const out: string[] = [];
  const f = fraccion(t);
  if (t.pricePerHour > 0) {
    out.push("Hora: " + money(t.pricePerHour, currency));
    if (f === 1) out.push("Se cobra por minuto (" + money(Math.round(t.pricePerHour / 60), currency) + " c/u)");
    else if (f !== 60)
      out.push("Se cobra cada " + f + " min (" + money(Math.round((t.pricePerHour * f) / 60), currency) + ")");
  }
  if (t.pricePerDay > 0) {
    out.push(t.pricePerHour > 0 ? "Día completo (tope): " + money(t.pricePerDay, currency) : "Día: " + money(t.pricePerDay, currency));
  }
  if (t.graceMinutes > 0) out.push("Primeros " + t.graceMinutes + " min sin costo");
  return out;
}

/** "Desde $1.500 hasta $20.000 por día". Vacio si la tarifa no cobra nada. */
export function rangoTexto(t: Tarifa, currency: string): string {
  const min = cobroMinimo(t);
  const max = cobroMaximoDia(t);
  if (max <= 0) return "";
  if (min === max) return money(max, currency) + " por día";
  return "Desde " + money(min, currency) + " hasta " + money(max, currency) + " por día";
}

/** Placa en mayusculas y sin espacios ni guiones: "abc-123" y "ABC 123" son la misma. */
export function normalizarPlaca(input: string): string {
  return String(input ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
}

/** Numero de ticket como sale impreso: 0007. */
export function numeroTicket(seq: number): string {
  return String(seq).padStart(4, "0");
}
