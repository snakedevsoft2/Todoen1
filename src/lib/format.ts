/**
 * La plata se guarda SIEMPRE en la unidad mas pequena de su moneda.
 *
 * En pesos colombianos esa unidad es el peso: nadie cobra centavos, y un
 * precio es 20000. En dolares, en euros o en soles la unidad es el centavo, y
 * un snack de $0.40 se guarda como 40.
 *
 * Es la unica forma de que la plata cuadre: guardar decimales en un entero los
 * pierde, y guardarlos en coma flotante hace que sumar tres precios de 0.10 no
 * de exactamente 0.30. Entero de centavos suma exacto siempre.
 *
 * Por eso todo lo que entra pasa por parseMoney y todo lo que sale por money:
 * ninguna pantalla deberia multiplicar o dividir por cien por su cuenta.
 */
const SIN_DECIMALES = ["COP", "CLP", "PYG", "JPY", "KRW", "ISK", "VND"];

/** Cuantos decimales usa esta moneda: 0 o 2. */
export function decimalesDe(currency = "COP"): 0 | 2 {
  return SIN_DECIMALES.includes(currency) ? 0 : 2;
}

/** Cuantas unidades minimas tiene una unidad de la moneda: 1 o 100. */
export function factorDe(currency = "COP"): 1 | 100 {
  return decimalesDe(currency) === 0 ? 1 : 100;
}

export function money(value: number, currency = "COP") {
  const decimals = decimalesDe(currency);
  const valor = value / factorDe(currency);
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(valor);
  } catch {
    return (
      "$" +
      valor.toLocaleString("es-CO", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    );
  }
}

/**
 * Lee lo que escribio la persona y lo deja en unidades minimas.
 *
 * Acepta como escribe la gente de verdad: "20.000", "20,000", "$ 20000" y, en
 * las monedas con centavos, "0,40" con coma, que es como lo teclea medio
 * continente.
 */
export function parseMoney(
  input: FormDataEntryValue | null | undefined,
  currency = "COP"
): number {
  if (input === null || input === undefined) return 0;

  let raw = String(input).replace(/[^\d,.-]/g, "");

  if (decimalesDe(currency) === 0) {
    // Sin centavos, un punto o una coma solo pueden ser separador de miles.
    raw = raw.replace(/[.,]/g, "");
  } else {
    // Con centavos hay que saber cual de los dos separa los decimales: es el
    // ultimo que aparezca. "1.234,56" y "1,234.56" son el mismo numero.
    const corte = Math.max(raw.lastIndexOf("."), raw.lastIndexOf(","));
    if (corte === -1) {
      raw = raw.replace(/[.,]/g, "");
    } else {
      const entero = raw.slice(0, corte).replace(/[.,]/g, "");
      const decimal = raw.slice(corte + 1).replace(/[.,]/g, "");
      // Tres cifras despues del separador son miles, no centavos: "1.500" es
      // mil quinientos, no uno con cinco.
      raw = decimal.length === 3 ? entero + decimal : entero + "." + decimal;
    }
  }

  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * factorDe(currency));
}

/** El salto que acepta un campo de plata: 1 peso, o 1 centavo. */
export function pasoMoneda(currency = "COP"): string {
  return decimalesDe(currency) === 0 ? "1" : "0.01";
}

/**
 * Un valor guardado, listo para meterlo en un campo de formulario.
 *
 * Es lo contrario de parseMoney: 40 centavos vuelven a ser "0.40" para que la
 * persona vea lo que escribio y no un numero que no reconoce.
 */
export function aCampo(value: number | null | undefined, currency = "COP"): string {
  if (value === null || value === undefined) return "";
  return decimalesDe(currency) === 0 ? String(value) : (value / 100).toFixed(2);
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
