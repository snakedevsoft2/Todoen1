import { randomInt } from "node:crypto";

/**
 * La clave de acceso de un comprobante electronico del SRI: 49 digitos que lo
 * identifican y que, desde 2014, son tambien su numero de autorizacion.
 *
 * Ficha tecnica de comprobantes electronicos (esquema offline), seccion 3:
 *
 *   fecha ddmmaaaa (8) · tipo de comprobante (2) · RUC (13) · ambiente (1)
 *   · establecimiento y punto de emision (6) · secuencial (9)
 *   · codigo numerico (8) · tipo de emision (1) · digito verificador (1)
 */

/** Tabla 3 del SRI: los comprobantes que emite la app. */
export const TIPO_COMPROBANTE = {
  factura: "01",
  notaCredito: "04",
  guiaRemision: "06",
  retencion: "07",
} as const;

export type TipoComprobante = (typeof TIPO_COMPROBANTE)[keyof typeof TIPO_COMPROBANTE];

/**
 * Digito verificador modulo 11: cada digito, de derecha a izquierda, por
 * 2, 3, 4, 5, 6, 7 y otra vez 2...; 11 menos el residuo de la suma. Si da 11
 * es 0 y si da 10 es 1.
 */
export function digitoModulo11(digitos: string): number {
  let suma = 0;
  let peso = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    suma += Number(digitos[i]) * peso;
    peso = peso === 7 ? 2 : peso + 1;
  }
  const d = 11 - (suma % 11);
  return d === 11 ? 0 : d === 10 ? 1 : d;
}

export type DatosClave = {
  /** "YYYY-MM-DD", el dia de emision en Ecuador. */
  fecha: string;
  tipo: TipoComprobante;
  ruc: string;
  ambiente: "pruebas" | "produccion";
  establecimiento: string;
  puntoEmision: string;
  secuencial: number;
  /** Ocho digitos que pone el emisor; si no se da, uno al azar. */
  codigoNumerico?: string;
};

export function claveAcceso(d: DatosClave): string {
  const [a, m, dia] = d.fecha.split("-");
  const codigo = d.codigoNumerico ?? String(randomInt(0, 100_000_000)).padStart(8, "0");
  const sin =
    dia + m + a +
    d.tipo +
    d.ruc +
    (d.ambiente === "produccion" ? "2" : "1") +
    d.establecimiento + d.puntoEmision +
    String(d.secuencial).padStart(9, "0") +
    codigo +
    "1"; // tipo de emision: normal
  if (!/^\d{48}$/.test(sin)) throw new Error("La clave de acceso no se pudo armar: revisa el RUC, el establecimiento y el punto de emisión.");
  return sin + digitoModulo11(sin);
}

/** Si la clave esta bien formada: 49 digitos y el ultimo es su verificador. */
export function claveValida(clave: string): boolean {
  return /^\d{49}$/.test(clave) && digitoModulo11(clave.slice(0, 48)) === Number(clave[48]);
}
