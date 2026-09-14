import { factorDe } from "../format";

/**
 * De los precios del catalogo (con el impuesto ya incluido) a lo que piden la
 * DIAN y el SRI: la base sin impuesto, el impuesto y el total, renglon por
 * renglon.
 *
 * En el mostrador el precio que se ve es el que se paga, asi que la app guarda
 * precios con impuesto. Los proveedores piden el precio neto y calculan el
 * impuesto encima: si se les mandara el precio de venta, la factura saldria
 * cobrando el impuesto dos veces.
 */

export type LineaVenta = { name: string; qty: number; unitPrice: number };

export type LineaFiscal = {
  nombre: string;
  cantidad: number;
  /** Precio unitario sin impuesto. */
  precioNeto: number;
  /** Cantidad por precio neto. */
  base: number;
  impuesto: number;
  total: number;
};

export type Totales = { base: number; impuesto: number; total: number };

export const redondear = (valor: number, decimales: number) => {
  const f = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * f) / f;
};

/**
 * Parte cada renglon en base e impuesto.
 *
 * `decimalesPrecio` es cuantos decimales acepta el proveedor en el precio
 * unitario: Factus acepta dos; el SRI hasta seis, y con seis la factura queda
 * al centavo del precio de venta.
 */
export function lineasFiscales(
  lineas: LineaVenta[],
  moneda: string,
  tarifa: number,
  decimalesPrecio: 2 | 6
): { lineas: LineaFiscal[]; totales: Totales } {
  const factor = factorDe(moneda);
  const fiscales = lineas.map((l) => {
    const bruto = l.unitPrice / factor;
    const precioNeto = redondear(bruto / (1 + tarifa / 100), decimalesPrecio);
    const base = redondear(precioNeto * l.qty, 2);
    const impuesto = redondear((base * tarifa) / 100, 2);
    return { nombre: l.name, cantidad: l.qty, precioNeto, base, impuesto, total: redondear(base + impuesto, 2) };
  });
  const base = redondear(fiscales.reduce((s, l) => s + l.base, 0), 2);
  const impuesto = redondear(fiscales.reduce((s, l) => s + l.impuesto, 0), 2);
  return { lineas: fiscales, totales: { base, impuesto, total: redondear(base + impuesto, 2) } };
}

/** El total de la venta en unidades de la moneda (pesos, dolares), no en centavos. */
export function totalEnMoneda(total: number, moneda: string): number {
  return total / factorDe(moneda);
}
