import { normalizar } from "./orden-productos";

/**
 * Reparto: la planilla diaria de cada vendedor de ruta de Chopo Snacks, que
 * antes llevaban en el Excel "VENTAS REPARTO". Solo la ve la administradora
 * (ver lib/chopo.ts) y no toca Ventas, Caja, Clientes ni Cuentas por cobrar.
 *
 * Todo en centavos enteros, como el resto de la aplicacion: 0,80 es 80. Asi
 * las cuentas dan al centavo lo mismo que el Excel y nunca hay 0,1 + 0,2 = 0,30000000000000004.
 *
 * Este archivo es el unico que sabe hacer las cuentas de una planilla: lo usan
 * la pantalla, los reportes y el importador. Si una formula cambia, cambia aqui.
 */

export type LineaReparto = {
  carga: number;
  devolucion: number;
  /** Precio del dia, en centavos. */
  precio: number;
  unidVendValor: number;
  dctoPrecio: number;
  dctoPromocion: number;
  caducadoCant: number;
  devolUnidadesValor: number;
};

export const vendidaDe = (l: Pick<LineaReparto, "carga" | "devolucion">) => l.carga - l.devolucion;

/** Columna G del Excel: lo vendido por el precio, sin IVA. */
export const base0De = (l: LineaReparto) => vendidaDe(l) * l.precio;

/** Columna P: lo caducado o dañado que devolvio el cliente, al precio del dia. */
export const caducadoValorDe = (l: LineaReparto) => l.caducadoCant * l.precio;

/** Columna R: (carga − devol) × precio + unid.vend − dcto precio − dcto promocion − caducado − devol. en unidades. */
export function totalLineaDe(l: LineaReparto): number {
  return base0De(l) + l.unidVendValor - l.dctoPrecio - l.dctoPromocion - caducadoValorDe(l) - l.devolUnidadesValor;
}

export type PlanillaParaCuadre = {
  lineas: LineaReparto[];
  /** "(-) Otros descuentos ventas", a nivel de planilla. */
  otrosDescuentos: number;
  creditos: { valor: number }[];
  /** Cobros de cartera y ajustes "DIF A FAVOR": los dos suman. */
  cobros: { valor: number }[];
  pagos: { valor: number }[];
  entregado: number;
};

export type Cuadre = {
  totalGeneral: number;
  ventasDiaria: number;
  credito: number;
  contado: number;
  cartera: number;
  recibido: number;
  pagos: number;
  caja: number;
  entregado: number;
  /** Positivo: entrego menos de lo que debia (faltante). Negativo: entrego de mas (sobrante). */
  diferencia: number;
  faltante: number;
  /** Negativo, como en el Excel. */
  sobrante: number;
  semaforo: Semaforo;
};

export type Semaforo = "cuadra" | "faltante" | "sobrante";

/** Hasta cinco centavos de diferencia se da por cuadrado. */
export const TOLERANCIA = 5;

export function semaforoDe(diferencia: number): Semaforo {
  if (Math.abs(diferencia) <= TOLERANCIA) return "cuadra";
  return diferencia > 0 ? "faltante" : "sobrante";
}

const suma = (xs: { valor: number }[]) => xs.reduce((s, x) => s + x.valor, 0);

/** El cuadre de caja de la planilla, con las mismas formulas del Excel. */
export function calcularCuadre(p: PlanillaParaCuadre): Cuadre {
  const totalGeneral = p.lineas.reduce((s, l) => s + totalLineaDe(l), 0);
  const ventasDiaria = totalGeneral - p.otrosDescuentos;
  const credito = suma(p.creditos);
  const contado = ventasDiaria - credito;
  const cartera = suma(p.cobros);
  const recibido = contado + cartera;
  const pagos = suma(p.pagos);
  const caja = recibido - pagos;
  const diferencia = caja - p.entregado;
  return {
    totalGeneral,
    ventasDiaria,
    credito,
    contado,
    cartera,
    recibido,
    pagos,
    caja,
    entregado: p.entregado,
    diferencia,
    faltante: diferencia > 0 ? diferencia : 0,
    sobrante: diferencia < 0 ? diferencia : 0,
    semaforo: semaforoDe(diferencia),
  };
}

/** Un valor en dolares (0.8, "0,80") a centavos. NaN si no es numero. */
export function aCentavos(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  const n = typeof valor === "number" ? valor : Number(String(valor).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/**
 * Lo que se escribe en una casilla de cantidad o de plata, como en el Excel:
 * "105+55", "40+19-20", "33.15+246", "405-250+10". Solo sumas y restas de
 * numeros; cualquier otra cosa da NaN, para que el formulario lo marque.
 */
export function evaluarSuma(texto: string | null | undefined): number {
  const t = String(texto ?? "").replace(/\s/g, "").replace(/^=/, "").replace(/,/g, ".");
  if (!t) return 0;
  if (!/^[+-]?\d+(\.\d+)?([+-]\d+(\.\d+)?)*$/.test(t)) return NaN;
  const partes = t.match(/[+-]?\d+(\.\d+)?/g) ?? [];
  // En centesimas y de vuelta, para que 33.15 + 246 no de 279.15000000000003.
  return partes.reduce((s, p) => s + Math.round(Number(p) * 10000), 0) / 10000;
}

/** Si lo escrito es una suma ("105+55") y no un numero solo, se guarda como detalle. */
export function esSuma(texto: string | null | undefined): boolean {
  return /\d[+-]\d/.test(String(texto ?? "").replace(/\s/g, ""));
}

export const CATEGORIAS_PAGO = [
  { key: "almuerzo", label: "Almuerzo" },
  { key: "transporte", label: "Transporte / transferencia" },
  { key: "deposito", label: "Depósito" },
  { key: "parqueo", label: "Parqueo" },
  { key: "combustible", label: "Combustible" },
  { key: "diferencia", label: "Diferencia" },
  { key: "entrega_persona", label: "Entrega a una persona" },
  { key: "otro", label: "Otro" },
] as const;

export type CategoriaPago = (typeof CATEGORIAS_PAGO)[number]["key"];

export function esCategoriaPago(v: string): v is CategoriaPago {
  return CATEGORIAS_PAGO.some((c) => c.key === v);
}

/**
 * La categoria de un pago por lo que dice el concepto, como lo escribian en el
 * Excel ("TRAS. ESCUELA ENMA", "DIFRE", "LUIS 450"). `personas` son los nombres
 * de pila del equipo: un concepto que empieza con uno es una entrega de plata.
 */
export function categoriaDePago(concepto: string, personas: string[] = []): CategoriaPago {
  const c = normalizar(concepto);
  if (/^almuer/.test(c)) return "almuerzo";
  if (/^(tra[ns]|tras|trasn|transf)/.test(c)) return "transporte";
  if (/^depo/.test(c)) return "deposito";
  if (/^parq/.test(c)) return "parqueo";
  if (/^(gasol|combus|diesel)/.test(c)) return "combustible";
  if (/^dif/.test(c)) return "diferencia";
  const primera = c.split(" ")[0];
  if (primera && personas.map(normalizar).some((p) => p.split(" ")[0] === primera)) return "entrega_persona";
  return "otro";
}

/** El nombre como llave: sin tildes, sin mayusculas, sin espacios de sobra. */
export const claveDe = normalizar;

/** Dias desde la fecha del documento hasta hoy ("YYYY-MM-DD"). */
export function antiguedad(desde: string, hoy: string): number {
  const a = Date.parse(desde + "T00:00:00Z");
  const b = Date.parse(hoy + "T00:00:00Z");
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : 0;
}

/** El tramo de antiguedad de una deuda, para el reporte de cartera. */
export function tramoDe(dias: number): string {
  if (dias <= 7) return "0-7 días";
  if (dias <= 15) return "8-15 días";
  if (dias <= 30) return "16-30 días";
  if (dias <= 60) return "31-60 días";
  return "Más de 60 días";
}
