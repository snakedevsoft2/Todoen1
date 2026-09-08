export function money(value: number, currency = "COP") {
  const decimals = currency === "COP" || currency === "CLP" || currency === "PYG" ? 0 : 2;
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `$${value.toLocaleString("es-CO")}`;
  }
}

export function parseMoney(input: FormDataEntryValue | null | undefined): number {
  if (input === null || input === undefined) return 0;
  const raw = String(input).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function parseIntSafe(input: FormDataEntryValue | null | undefined, fallback = 0): number {
  const n = Number(String(input ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function str(input: FormDataEntryValue | null | undefined, fallback = ""): string {
  const v = String(input ?? "").trim();
  return v.length ? v : fallback;
}

const DAY_LABELS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Recibe "YYYY-MM-DD" y devuelve "lunes 8 de septiembre de 2026". */
export function prettyDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${DAY_LABELS[date.getUTCDay()]} ${d} de ${MONTHS[m - 1]} de ${y}`;
}

export function shortDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function pretty12h(time: string) {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return time;
  const suffix = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}
