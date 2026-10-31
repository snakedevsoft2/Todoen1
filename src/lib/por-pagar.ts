import { esAdminDeChopo } from "./chopo";
import { factorDe, money } from "./format";

/**
 * Cuentas por pagar a proveedores: lo que Chopo Snacks llevaba en su Excel,
 * una hoja por proveedor con cada compra, sus renglones y si ya se pago.
 *
 * Solo lo ve la administradora del negocio (ver esAdminDeChopo).
 */
export const puedeVerPorPagar = esAdminDeChopo;

export const RUTA_POR_PAGAR = "/panel/por-pagar";

/** Cuatro decimales, como se guardan: sin esto 0,1 + 0,2 no da 0,3. */
export function redondear(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Lo que se escribe en el telefono: "1,5217", "1.5217", "98,5", "US$ 3,25".
 * Si vienen punto y coma, el ultimo separa los decimales ("1.234,56"). NaN si
 * no hay numero.
 */
export function leerCifra(texto: string | null | undefined): number {
  let t = String(texto ?? "").replace(/[^\d.,-]/g, "");
  if (!t) return NaN;
  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    const decimal = coma > punto ? "," : ".";
    const miles = decimal === "," ? "." : ",";
    t = t.split(miles).join("").replace(decimal, ".");
  } else {
    t = t.replace(",", ".");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export type Renglon = {
  qty: number;
  unitPrice: number;
  discount: number;
  salePrice: number | null;
};

/** Cantidad por precio, menos el descuento. */
export function subtotalDe(r: Renglon): number {
  return redondear(r.qty * r.unitPrice - r.discount);
}

/** A como se revende ese renglon. Nulo si no se lleva precio de venta. */
export function ventaDe(r: Renglon): number | null {
  return r.salePrice === null ? null : redondear(r.qty * r.salePrice);
}

/** La suma de los renglones, antes del IVA. */
export function subtotalesDe(renglones: Renglon[]): number {
  return redondear(renglones.reduce((s, r) => s + subtotalDe(r), 0));
}

/**
 * Lo que se le debe por la compra: los renglones y, si la factura lo trae, el
 * IVA encima (en la hoja de MARCSEAL, 57,67 + 15 % = 66,3).
 */
export function totalDe(renglones: Renglon[], iva = 0): number {
  return redondear(subtotalesDe(renglones) * (1 + iva / 100));
}

/** El total de venta de la compra, si algun renglon lo lleva. */
export function totalVentaDe(renglones: Renglon[]): number | null {
  const conVenta = renglones.filter((r) => r.salePrice !== null);
  if (conVenta.length === 0) return null;
  return redondear(conVenta.reduce((s, r) => s + (ventaDe(r) ?? 0), 0));
}

/**
 * Lo que queda de ganancia al revender la compra: la venta menos lo que costo,
 * con su IVA. Solo cuenta los renglones que llevan precio de venta: los que
 * no, no se sabe a como salen.
 */
export function gananciaDe(renglones: Renglon[], iva = 0): number | null {
  const conVenta = renglones.filter((r) => r.salePrice !== null);
  if (conVenta.length === 0) return null;
  return redondear((totalVentaDe(conVenta) ?? 0) - totalDe(conVenta, iva));
}

export type EstadoCompra = "PENDIENTE" | "CANCELADO";

/** Cancelado es pagado del todo, como en la hoja: con un centavo pendiente sigue pendiente. */
export function estadoDe(total: number, pagado: number): EstadoCompra {
  return redondear(total - pagado) > 0.004 ? "PENDIENTE" : "CANCELADO";
}

/** Plata, como en el resto de la aplicacion. */
export function dinero(n: number, currency: string): string {
  return money(Math.round(n * factorDe(currency)), currency);
}

/** Una cantidad o un precio unitario, con los decimales que traiga (hasta cuatro). */
export function cifra(n: number): string {
  return new Intl.NumberFormat("es-EC", { maximumFractionDigits: 4 }).format(n);
}
