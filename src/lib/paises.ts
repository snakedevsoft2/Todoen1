/**
 * Los paises donde puede estar un negocio.
 *
 * De cada pais sale lo que antes habia que elegir a mano: la moneda, la zona
 * horaria (algunos paises tienen varias) y el indicativo para WhatsApp. El
 * formato de los numeros sale de la moneda (lib/format.ts).
 *
 * "OTRO" es cualquier pais que no este en la lista: la persona elige la moneda
 * y la zona de la lista completa que conoce el navegador, y ningun negocio
 * queda por fuera.
 *
 * Archivo puro: lo usan el registro y los ajustes en el navegador, y el
 * servidor para validar.
 */

export type Pais = {
  /** Codigo ISO de dos letras. */
  code: string;
  nombre: string;
  /** Moneda por defecto (ISO 4217). */
  moneda: string;
  /** Zonas horarias del pais; la primera es la principal. */
  zonas: string[];
  /** Indicativo telefonico, solo digitos. */
  indicativo: string;
};

export const OTRO_PAIS = "OTRO";

const LISTA: Pais[] = [
  // Latinoamerica y el Caribe
  { code: "AR", nombre: "Argentina", moneda: "ARS", zonas: ["America/Argentina/Buenos_Aires", "America/Argentina/Cordoba", "America/Argentina/Mendoza"], indicativo: "54" },
  { code: "BZ", nombre: "Belice", moneda: "BZD", zonas: ["America/Belize"], indicativo: "501" },
  { code: "BO", nombre: "Bolivia", moneda: "BOB", zonas: ["America/La_Paz"], indicativo: "591" },
  { code: "BR", nombre: "Brasil", moneda: "BRL", zonas: ["America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Recife", "America/Belem"], indicativo: "55" },
  { code: "CL", nombre: "Chile", moneda: "CLP", zonas: ["America/Santiago", "Pacific/Easter"], indicativo: "56" },
  { code: "CO", nombre: "Colombia", moneda: "COP", zonas: ["America/Bogota"], indicativo: "57" },
  { code: "CR", nombre: "Costa Rica", moneda: "CRC", zonas: ["America/Costa_Rica"], indicativo: "506" },
  { code: "CU", nombre: "Cuba", moneda: "CUP", zonas: ["America/Havana"], indicativo: "53" },
  { code: "EC", nombre: "Ecuador", moneda: "USD", zonas: ["America/Guayaquil", "Pacific/Galapagos"], indicativo: "593" },
  { code: "SV", nombre: "El Salvador", moneda: "USD", zonas: ["America/El_Salvador"], indicativo: "503" },
  { code: "GT", nombre: "Guatemala", moneda: "GTQ", zonas: ["America/Guatemala"], indicativo: "502" },
  { code: "GY", nombre: "Guyana", moneda: "GYD", zonas: ["America/Guyana"], indicativo: "592" },
  { code: "HT", nombre: "Haití", moneda: "HTG", zonas: ["America/Port-au-Prince"], indicativo: "509" },
  { code: "HN", nombre: "Honduras", moneda: "HNL", zonas: ["America/Tegucigalpa"], indicativo: "504" },
  { code: "JM", nombre: "Jamaica", moneda: "JMD", zonas: ["America/Jamaica"], indicativo: "1" },
  { code: "MX", nombre: "México", moneda: "MXN", zonas: ["America/Mexico_City", "America/Monterrey", "America/Cancun", "America/Chihuahua", "America/Tijuana", "America/Hermosillo", "America/Mazatlan"], indicativo: "52" },
  { code: "NI", nombre: "Nicaragua", moneda: "NIO", zonas: ["America/Managua"], indicativo: "505" },
  { code: "PA", nombre: "Panamá", moneda: "USD", zonas: ["America/Panama"], indicativo: "507" },
  { code: "PY", nombre: "Paraguay", moneda: "PYG", zonas: ["America/Asuncion"], indicativo: "595" },
  { code: "PE", nombre: "Perú", moneda: "PEN", zonas: ["America/Lima"], indicativo: "51" },
  { code: "PR", nombre: "Puerto Rico", moneda: "USD", zonas: ["America/Puerto_Rico"], indicativo: "1" },
  { code: "DO", nombre: "República Dominicana", moneda: "DOP", zonas: ["America/Santo_Domingo"], indicativo: "1" },
  { code: "SR", nombre: "Surinam", moneda: "SRD", zonas: ["America/Paramaribo"], indicativo: "597" },
  { code: "TT", nombre: "Trinidad y Tobago", moneda: "TTD", zonas: ["America/Port_of_Spain"], indicativo: "1" },
  { code: "UY", nombre: "Uruguay", moneda: "UYU", zonas: ["America/Montevideo"], indicativo: "598" },
  { code: "VE", nombre: "Venezuela", moneda: "VES", zonas: ["America/Caracas"], indicativo: "58" },
  // Norteamerica
  { code: "CA", nombre: "Canadá", moneda: "CAD", zonas: ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax"], indicativo: "1" },
  { code: "US", nombre: "Estados Unidos", moneda: "USD", zonas: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu"], indicativo: "1" },
  // Europa
  { code: "DE", nombre: "Alemania", moneda: "EUR", zonas: ["Europe/Berlin"], indicativo: "49" },
  { code: "AD", nombre: "Andorra", moneda: "EUR", zonas: ["Europe/Andorra"], indicativo: "376" },
  { code: "BE", nombre: "Bélgica", moneda: "EUR", zonas: ["Europe/Brussels"], indicativo: "32" },
  { code: "ES", nombre: "España", moneda: "EUR", zonas: ["Europe/Madrid", "Atlantic/Canary"], indicativo: "34" },
  { code: "FR", nombre: "Francia", moneda: "EUR", zonas: ["Europe/Paris"], indicativo: "33" },
  { code: "IE", nombre: "Irlanda", moneda: "EUR", zonas: ["Europe/Dublin"], indicativo: "353" },
  { code: "IT", nombre: "Italia", moneda: "EUR", zonas: ["Europe/Rome"], indicativo: "39" },
  { code: "NL", nombre: "Países Bajos", moneda: "EUR", zonas: ["Europe/Amsterdam"], indicativo: "31" },
  { code: "PT", nombre: "Portugal", moneda: "EUR", zonas: ["Europe/Lisbon", "Atlantic/Azores"], indicativo: "351" },
  { code: "GB", nombre: "Reino Unido", moneda: "GBP", zonas: ["Europe/London"], indicativo: "44" },
  { code: "CH", nombre: "Suiza", moneda: "CHF", zonas: ["Europe/Zurich"], indicativo: "41" },
  // Otras regiones
  { code: "AU", nombre: "Australia", moneda: "AUD", zonas: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth"], indicativo: "61" },
  { code: "CN", nombre: "China", moneda: "CNY", zonas: ["Asia/Shanghai"], indicativo: "86" },
  { code: "KR", nombre: "Corea del Sur", moneda: "KRW", zonas: ["Asia/Seoul"], indicativo: "82" },
  { code: "AE", nombre: "Emiratos Árabes Unidos", moneda: "AED", zonas: ["Asia/Dubai"], indicativo: "971" },
  { code: "PH", nombre: "Filipinas", moneda: "PHP", zonas: ["Asia/Manila"], indicativo: "63" },
  { code: "GQ", nombre: "Guinea Ecuatorial", moneda: "XAF", zonas: ["Africa/Malabo"], indicativo: "240" },
  { code: "IN", nombre: "India", moneda: "INR", zonas: ["Asia/Kolkata"], indicativo: "91" },
  { code: "IL", nombre: "Israel", moneda: "ILS", zonas: ["Asia/Jerusalem"], indicativo: "972" },
  { code: "JP", nombre: "Japón", moneda: "JPY", zonas: ["Asia/Tokyo"], indicativo: "81" },
  { code: "MA", nombre: "Marruecos", moneda: "MAD", zonas: ["Africa/Casablanca"], indicativo: "212" },
  { code: "NG", nombre: "Nigeria", moneda: "NGN", zonas: ["Africa/Lagos"], indicativo: "234" },
  { code: "ZA", nombre: "Sudáfrica", moneda: "ZAR", zonas: ["Africa/Johannesburg"], indicativo: "27" },
];

/** Ordenados por nombre, como se muestran. */
export const PAISES: Pais[] = [...LISTA].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

export function paisPorCodigo(code: string | null | undefined): Pais | null {
  return PAISES.find((p) => p.code === code) ?? null;
}

export function esPaisValido(code: unknown): code is string {
  return code === OTRO_PAIS || PAISES.some((p) => p.code === code);
}

/** El pais de una zona horaria, si esta en la lista. */
export function paisDeZona(zona: string | null | undefined): Pais | null {
  return (zona && PAISES.find((p) => p.zonas.includes(zona))) || null;
}

/** La zona para un pais: la que ya tenia si es de ese pais; si no, la principal. */
export function zonaParaPais(code: string, zonaActual?: string | null): string {
  const pais = paisPorCodigo(code);
  if (!pais) return zonaActual && esZonaValida(zonaActual) ? zonaActual : "America/Bogota";
  return zonaActual && pais.zonas.includes(zonaActual) ? zonaActual : pais.zonas[0];
}

type ConLista = { supportedValuesOf?: (clave: string) => string[] };

/** Todas las zonas horarias que conoce este navegador o servidor. */
export function todasLasZonas(): string[] {
  try {
    const lista = (Intl as unknown as ConLista).supportedValuesOf?.("timeZone");
    if (lista && lista.length > 0) return lista;
  } catch {
    // Navegador viejo: se usan las de la lista de paises.
  }
  return [...new Set(PAISES.flatMap((p) => p.zonas))].sort();
}

/** Todas las monedas que conoce este navegador o servidor. */
export function todasLasMonedas(): string[] {
  try {
    const lista = (Intl as unknown as ConLista).supportedValuesOf?.("currency");
    if (lista && lista.length > 0) return lista;
  } catch {
    // Navegador viejo: se usan las de la lista de paises.
  }
  return [...new Set(PAISES.map((p) => p.moneda))].sort();
}

export function esZonaValida(zona: unknown): zona is string {
  if (typeof zona !== "string" || !zona || zona.length > 60) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

export function esMonedaValida(moneda: unknown): moneda is string {
  if (typeof moneda !== "string" || !/^[A-Z]{3}$/.test(moneda)) return false;
  try {
    new Intl.NumberFormat("es", { style: "currency", currency: moneda });
    return true;
  } catch {
    return false;
  }
}

/** "America/Argentina/Buenos_Aires" -> "Argentina / Buenos Aires". */
export function nombreZona(zona: string): string {
  const partes = zona.split("/");
  const lugar = (partes.length > 1 ? partes.slice(1) : partes).join(" / ");
  return lugar.replace(/_/g, " ");
}

/** "COP · peso colombiano", con el nombre en español si el navegador lo sabe. */
export function nombreMoneda(moneda: string): string {
  try {
    const nombres = new Intl.DisplayNames(["es"], { type: "currency" });
    const nombre = nombres.of(moneda);
    return nombre && nombre !== moneda ? moneda + " · " + nombre : moneda;
  } catch {
    return moneda;
  }
}
