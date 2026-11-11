import { addDays, isoWeekday } from "./dates";

/**
 * Los dias en que no se cobra: domingos y festivos.
 *
 * Lo pidio EM Inversiones (ver lib/em-inversiones.ts): "los festivos no se
 * trabaja ni los domingos". Si la aplicacion le pone cuota a un cliente
 * diario un domingo, al lunes ya lo muestra atrasado sin que lo este.
 *
 * Archivo puro, sin base de datos: lo usan igual el servidor (el plan de
 * cuotas, la lista del dia) y el navegador (el resumen mientras se anota el
 * prestamo).
 *
 * Por ahora solo se conocen los festivos de Colombia, que es donde trabaja
 * quien lo pidio. En otro pais solo se salta el domingo.
 */

/**
 * El domingo de Pascua de un año (calendario gregoriano, metodo de Meeus).
 * De ahi salen la Semana Santa y los festivos que se mueven con ella.
 */
export function pascua(año: number): string {
  const a = año % 19;
  const b = Math.floor(año / 100);
  const c = año % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return año + "-" + String(mes).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
}

/** El mismo dia si es lunes; si no, el lunes siguiente (Ley Emiliani). */
function alLunes(dia: string): string {
  const wd = isoWeekday(dia);
  return wd === 1 ? dia : addDays(dia, 8 - wd);
}

const cache = new Map<number, Map<string, string>>();

/**
 * Los festivos de Colombia de un año, con su nombre.
 *
 * Unos caen siempre el mismo dia, otros se corren al lunes (Ley 51 de 1983) y
 * otros dependen de la Pascua.
 */
export function festivosColombia(año: number): Map<string, string> {
  const guardado = cache.get(año);
  if (guardado) return guardado;

  const f = (mmdd: string) => año + "-" + mmdd;
  const p = pascua(año);
  const lista: [string, string][] = [
    [f("01-01"), "Año Nuevo"],
    [alLunes(f("01-06")), "Reyes Magos"],
    [alLunes(f("03-19")), "San José"],
    [addDays(p, -3), "Jueves Santo"],
    [addDays(p, -2), "Viernes Santo"],
    [f("05-01"), "Día del Trabajo"],
    [addDays(p, 43), "Ascensión del Señor"],
    [addDays(p, 64), "Corpus Christi"],
    [addDays(p, 71), "Sagrado Corazón"],
    [alLunes(f("06-29")), "San Pedro y San Pablo"],
    [f("07-20"), "Día de la Independencia"],
    [f("08-07"), "Batalla de Boyacá"],
    [alLunes(f("08-15")), "La Asunción de la Virgen"],
    [alLunes(f("10-12")), "Día de la Raza"],
    [alLunes(f("11-01")), "Todos los Santos"],
    [alLunes(f("11-11")), "Independencia de Cartagena"],
    [f("12-08"), "Inmaculada Concepción"],
    [f("12-25"), "Navidad"],
  ];

  const mapa = new Map<string, string>();
  for (const [dia, nombre] of lista) {
    // Si dos caen el mismo dia (pasa con la Ascension y otro corrido), queda
    // el primero; el dia sigue siendo festivo igual.
    if (!mapa.has(dia)) mapa.set(dia, nombre);
  }
  cache.set(año, mapa);
  return mapa;
}

/** El nombre del festivo de ese dia, o null si es un dia comun. */
export function festivoDe(dia: string, pais = "CO"): string | null {
  if (pais !== "CO") return null;
  const año = Number(dia.slice(0, 4));
  if (!año) return null;
  return festivosColombia(año).get(dia) ?? null;
}

/** Por que ese dia no se cobra ("Domingo", "Festivo: Navidad"), o null si se cobra. */
export function porQueNoSeCobra(dia: string, pais = "CO"): string | null {
  const festivo = festivoDe(dia, pais);
  if (festivo) return "Festivo: " + festivo;
  if (isoWeekday(dia) === 7) return "Domingo";
  return null;
}

/** Si ese dia se sale a cobrar: de lunes a sabado, sin festivos. */
export function esDiaDeCobro(dia: string, pais = "CO"): boolean {
  return porQueNoSeCobra(dia, pais) === null;
}

/**
 * El mismo dia si se cobra; si no, el siguiente que si.
 *
 * El tope es por si acaso: nunca hay mas de tres dias seguidos sin cobro
 * (sabado no cuenta, domingo y lunes festivo, o jueves y viernes santo y
 * domingo), pero un bucle sin tope es un bucle que algun dia no termina.
 */
export function siguienteDiaDeCobro(dia: string, pais = "CO"): string {
  let d = dia;
  for (let i = 0; i < 14 && !esDiaDeCobro(d, pais); i += 1) d = addDays(d, 1);
  return d;
}

/** El dia de cobro anterior a ese (sin contar ese mismo). */
export function anteriorDiaDeCobro(dia: string, pais = "CO"): string {
  let d = addDays(dia, -1);
  for (let i = 0; i < 14 && !esDiaDeCobro(d, pais); i += 1) d = addDays(d, -1);
  return d;
}
