/**
 * Promociones al por mayor.
 *
 * El negocio arma escalas por cantidad ("desde 6 prendas, 10% menos") y el
 * catalogo publico las aplica solo, mirando cuantas unidades lleva el pedido
 * completo y no cuantas de cada prenda: el mayorista casi siempre surte
 * tallas y colores distintos, y cobrarle el descuento por referencia seria
 * pedirle que compre seis camisas iguales.
 *
 * Vive aparte de las acciones porque lo usan el servidor y el navegador: aqui
 * no se toca la base de datos, solo se hacen cuentas.
 */

export type Tier = {
  id: string;
  /** Desde cuantas unidades arranca la escala. */
  minQty: number;
  /** Cuanto se le baja a cada unidad, en porcentaje. */
  percentOff: number;
  label: string | null;
};

/** Cuantas escalas puede tener un negocio. Mas de esto ya no se lee. */
export const MAX_TIERS = 6;
export const MIN_QTY = 2;
export const MAX_QTY = 9999;
export const MIN_PERCENT = 1;
export const MAX_PERCENT = 90;

/** De la escala mas pequena a la mas grande, que es como se leen. */
export function sortTiers<T extends { minQty: number }>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => a.minQty - b.minQty);
}

/**
 * La escala que le toca a un pedido de `qty` unidades: la mas alta que ya
 * alcanzo. Devuelve null si todavia no llega a la primera.
 */
export function tierForQty(tiers: Tier[], qty: number): Tier | null {
  let ganadora: Tier | null = null;
  for (const t of sortTiers(tiers)) {
    if (qty >= t.minQty) ganadora = t;
  }
  return ganadora;
}

/** La siguiente escala que podria alcanzar, para poder decirle cuanto le falta. */
export function nextTier(tiers: Tier[], qty: number): Tier | null {
  return sortTiers(tiers).find((t) => qty < t.minQty) ?? null;
}

/** El precio de una unidad ya con el descuento de la escala. */
export function tierPrice(price: number, percentOff: number): number {
  const pct = clampPercent(percentOff);
  return Math.max(0, Math.round((price * (100 - pct)) / 100));
}

/** Como se lee la escala en pantalla: "Paca - desde 12" o "Desde 12". */
export function tierLabel(tier: Tier, unit = "unidades"): string {
  const desde = "Desde " + tier.minQty + " " + unit;
  return tier.label ? tier.label + " - " + desde.toLowerCase() : desde;
}

export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(MAX_PERCENT, Math.max(0, Math.trunc(percent)));
}

export type OrderLine = { precio: number; qty: number };

export type WholesaleTotals = {
  /** Unidades del pedido completo. */
  units: number;
  /** Lo que costaria sin ninguna promocion. */
  full: number;
  /** Lo que cuesta con la escala aplicada. */
  total: number;
  /** Cuanto se ahorra. Cero si todavia no alcanza ninguna escala. */
  saved: number;
  tier: Tier | null;
  next: Tier | null;
  /** Cuantas unidades le faltan para la siguiente escala. */
  missing: number;
};

/**
 * Las cuentas del pedido con las escalas aplicadas.
 *
 * Se descuenta linea por linea y no sobre el total para que el precio que ve
 * el cliente en cada renglon sume exactamente el total: redondear una sola vez
 * al final deja diferencias de pesos que despues nadie sabe explicar.
 */
export function wholesaleTotals(lines: OrderLine[], tiers: Tier[]): WholesaleTotals {
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const full = lines.reduce((s, l) => s + l.precio * l.qty, 0);
  const tier = tiers.length > 0 ? tierForQty(tiers, units) : null;
  const total = tier
    ? lines.reduce((s, l) => s + tierPrice(l.precio, tier.percentOff) * l.qty, 0)
    : full;
  const next = tiers.length > 0 ? nextTier(tiers, units) : null;
  return {
    units,
    full,
    total,
    saved: full - total,
    tier,
    next,
    missing: next ? Math.max(0, next.minQty - units) : 0,
  };
}
