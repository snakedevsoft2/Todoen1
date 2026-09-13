/**
 * Todas las fechas del negocio se manejan como texto "YYYY-MM-DD" en la zona
 * horaria del negocio. Asi los reportes del dia nunca se corren por UTC.
 */
export function todayIn(timezone = "America/Bogota"): string {
  return dayIn(new Date(), timezone);
}

export function dayIn(date: Date, timezone = "America/Bogota"): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function timeIn(date: Date, timezone = "America/Bogota"): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

export function isValidDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`));
}

/** 1 = lunes ... 7 = domingo */
export function isoWeekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=domingo
  return wd === 0 ? 7 : wd;
}

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Lista de dias desde `from` hasta `to` inclusive (max 400). */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutos que la zona horaria le lleva a UTC en ese instante. Bogota da -300. */
function desfaseMin(date: Date, timezone: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  const comoUTC = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return Math.round((comoUTC - date.getTime()) / 60000);
}

/**
 * El instante en que empieza un dia "YYYY-MM-DD" en la zona del negocio.
 *
 * Hace falta para consultar la base por dia. `new Date(dia + "T00:00:00")`
 * usa la zona del SERVIDOR, y en Vercel el servidor esta en UTC: la medianoche
 * de Bogota caeria a las 7 p. m. del dia anterior y todo lo marcado despues de
 * esa hora se iria al dia siguiente.
 *
 * Se calcula dos veces por los paises con cambio de hora: el desfase de la
 * medianoche puede no ser el mismo que el de la hora que se uso de primera
 * aproximacion.
 */
export function inicioDelDiaEn(day: string, timezone = "America/Bogota"): Date {
  const base = Date.parse(day + "T00:00:00Z");
  try {
    let t = base - desfaseMin(new Date(base), timezone) * 60000;
    t = base - desfaseMin(new Date(t), timezone) * 60000;
    return new Date(t);
  } catch {
    return new Date(base);
  }
}
