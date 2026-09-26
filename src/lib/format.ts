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
const SIN_DECIMALES = ["COP", "CLP", "PYG", "JPY", "KRW", "ISK", "VND", "XOF", "XAF", "XPF", "UGX", "RWF", "KMF", "GNF", "DJF", "BIF", "VUV"];

/**
 * Como se escribe la plata en el pais de cada moneda: "S/ 3.00" en Peru,
 * "$3.00" en Mexico, "R$ 3,00" en Brasil. Las que no estan (el peso
 * colombiano, el dolar) siguen como siempre.
 */
const LOCALE_POR_MONEDA: Record<string, string> = {
  MXN: "es-MX",
  PEN: "es-PE",
  CLP: "es-CL",
  ARS: "es-AR",
  DOP: "es-DO",
  VES: "es-VE",
  GTQ: "es-GT",
  HNL: "es-HN",
  NIO: "es-NI",
  CRC: "es-CR",
  BOB: "es-BO",
  PYG: "es-PY",
  UYU: "es-UY",
  CUP: "es-CU",
  BRL: "pt-BR",
  EUR: "es-ES",
};

/** Cuantos decimales usa esta moneda: 0 o 2. */
export function decimalesDe(currency = "COP"): 0 | 2 {
  return SIN_DECIMALES.includes(currency) ? 0 : 2;
}

/**
 * Tope de cualquier cifra de plata, en unidades minimas.
 *
 * Las columnas de plata son Int de 32 bits, que llega hasta 2.147.483.647.
 * Se corta un poco antes para que ninguna suma intermedia se pase y reviente
 * el guardado con un error del motor en vez de un aviso que se entienda.
 */
export const TOPE_MONEDA = 2_000_000_000;

/** Cuantas unidades minimas tiene una unidad de la moneda: 1 o 100. */
export function factorDe(currency = "COP"): 1 | 100 {
  return decimalesDe(currency) === 0 ? 1 : 100;
}

export function money(value: number, currency = "COP") {
  const decimals = decimalesDe(currency);
  const valor = value / factorDe(currency);
  try {
    return new Intl.NumberFormat(LOCALE_POR_MONEDA[currency] ?? "es-CO", {
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
 * El mismo numero pero sin el simbolo de la moneda.
 *
 * Es para la tirilla termica, donde el ancho es lo que falta: repetir "US$"
 * en cada renglon de producto se come cuatro letras por renglon y obliga a
 * partir la linea en dos. La moneda se dice una vez, en el TOTAL, que es
 * donde de verdad importa.
 */
export function moneyCorto(value: number, currency = "COP") {
  const decimals = decimalesDe(currency);
  const valor = value / factorDe(currency);
  // El try va por lo mismo que en money(): hay Android viejos cuyo navegador
  // trae Intl recortado y revienta al pedirle un idioma. Sin esta red, un
  // telefono asi no sacaba un recibo mas corto: no sacaba NINGUN recibo,
  // porque la excepcion tumba el armado entero.
  try {
    return valor.toLocaleString(LOCALE_POR_MONEDA[currency] ?? "es-CO", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    return valor.toFixed(decimals).replace(".", ",");
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
      /*
       * Tres cifras despues del separador suelen ser miles y no centavos:
       * "1.500" es mil quinientos, no uno con cinco.
       *
       * Pero solo cuando hay algo que multiplicar. "0.999" no puede ser
       * novecientos noventa y nueve: es un precio con tres decimales, y
       * leerlo como miles lo multiplicaba por mil. Un snack de $0,999
       * quedaba en $999.
       */
      const pareceMiles = decimal.length === 3 && entero !== "" && entero !== "0";
      raw = pareceMiles ? entero + decimal : entero + "." + decimal;
    }
  }

  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;

  /*
   * La plata nunca es negativa ni infinita.
   *
   * Un "-" delante convertia un costo en negativo y le daba la vuelta al
   * margen sin que nada avisara. Y el tope es el del entero de la base de
   * datos: sin el, pegar dieciocho cifras en un campo tumbaba el guardado con
   * un error de Postgres en vez de un aviso legible.
   */
  return Math.min(TOPE_MONEDA, Math.max(0, Math.round(n * factorDe(currency))));
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

/**
 * Texto que escribio el usuario, recortado a un largo razonable.
 *
 * El tope existe porque nada impide pegar cinco mil letras en un campo de
 * nombre: la base lo aguanta, pero la pantalla queda inservible y el PDF
 * tambien. Doscientos alcanza para el nombre mas largo de verdad; lo que
 * necesite mas (una nota, una descripcion) pide su propio tope.
 */
export function str(
  input: FormDataEntryValue | null | undefined,
  fallback = "",
  max = 200
): string {
  const v = String(input ?? "").trim().slice(0, max);
  return v.length ? v : fallback;
}

/**
 * El valor completo, sin tope.
 *
 * Para lo que nunca es texto escrito a mano: una imagen como data URL, un
 * carrito en JSON, un token. OJO: pasarlos por str() los corta a doscientos
 * caracteres, y una imagen cortada pasa la validacion (sigue siendo base64) y
 * queda guardada rota. Asi se perdieron portadas, logos y fotos. Cada uno de
 * estos campos tiene que validar su propio tamano.
 */
export function crudo(input: FormDataEntryValue | null | undefined): string {
  return typeof input === "string" ? input.trim() : "";
}

/** Para notas y descripciones, donde si tiene sentido escribir un parrafo. */
export function texto(input: FormDataEntryValue | null | undefined, max = 2000): string {
  return String(input ?? "").trim().slice(0, max);
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
