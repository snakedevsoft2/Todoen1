import { addDays, startOfMonth } from "./dates";
import { normalizar } from "./orden-productos";

/**
 * El inventario del mecato de MB NAILS SPA (ver lib/mb-nails.ts): cuanto queda
 * de cada bebida y cada paquete, y que se vendio, cuando, a quien y quien lo
 * vendio. Lo pidio el usuario el 25 nov 2026.
 *
 * Este archivo no toca la base: decide que es mecato, como se lee un conteo y
 * como se resume lo vendido. La pantalla es components/InventarioMecato.tsx y
 * lo que guarda es actions/mecato-mb.ts.
 */

/** Las categorias que son productos para vender y no servicios con cita. */
const CATEGORIAS_MECATO = new Set(["bebidas", "bebida", "mecato", "mecatos", "snacks"]);

export function esCategoriaDeMecato(categoria: string | null | undefined): boolean {
  return CATEGORIAS_MECATO.has(normalizar(categoria ?? ""));
}

/** Desde cuantas unidades se avisa que se esta acabando, si no tiene un minimo propio. */
export const POCOS_MECATO = 3;

export type EstadoMecato = "sin-contar" | "agotado" | "pocos" | "bien";

export function estadoMecato(p: { contado: boolean; stock: number; minStock: number }): EstadoMecato {
  if (!p.contado) return "sin-contar";
  if (p.stock <= 0) return "agotado";
  if (p.stock <= Math.max(p.minStock, POCOS_MECATO)) return "pocos";
  return "bien";
}

export type RangoMecato = "hoy" | "ayer" | "7d" | "mes";

export const RANGOS_MECATO: { key: RangoMecato; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "ayer", label: "Ayer" },
  { key: "7d", label: "7 días" },
  { key: "mes", label: "Este mes" },
];

/** Los dias de "Mecato vendido": hoy si no se pide otra cosa. */
export function rangoMecato(raw: string | undefined, hoy: string): { key: RangoMecato; desde: string; hasta: string } {
  switch (raw) {
    case "ayer":
      return { key: "ayer", desde: addDays(hoy, -1), hasta: addDays(hoy, -1) };
    case "7d":
      return { key: "7d", desde: addDays(hoy, -6), hasta: hoy };
    case "mes":
      return { key: "mes", desde: startOfMonth(hoy), hasta: hoy };
    default:
      return { key: "hoy", desde: hoy, hasta: hoy };
  }
}

/**
 * Una fila del inventario: un producto (o una de sus presentaciones, si tiene
 * varias). `contado` es si ya lleva inventario; si no, la cantidad que se
 * escriba es la primera vez que se cuenta.
 */
export type ProductoContable = {
  serviceId: string;
  /** La presentacion donde vive el stock. Null si todavia no tiene ninguna. */
  variantId: string | null;
  name: string;
  stock: number;
  contado: boolean;
};

/** El nombre del campo de cada fila en el formulario de cargar o contar. */
export function claveConteo(p: Pick<ProductoContable, "serviceId" | "variantId" | "contado">): string {
  return p.contado && p.variantId ? "v:" + p.variantId : "s:" + p.serviceId;
}

export type ModoConteo = "entrada" | "conteo";

export type MovimientoConteo = {
  serviceId: string;
  variantId: string | null;
  name: string;
  tipo: "ENTRADA" | "AJUSTE";
  delta: number;
  /** Es la primera vez que se cuenta: hay que prenderle el inventario. */
  inicial: boolean;
  /** Cuantas quedan despues. */
  queda: number;
};

const MAXIMO = 100000;

/**
 * Lo que hay que mover segun lo que la dueña escribio.
 *
 * - "entrada" (llego mercancia): lo escrito se SUMA a lo que habia.
 * - "conteo" (conto lo que hay): lo escrito REEMPLAZA lo que habia.
 *
 * Lo que todavia no se ha contado nunca arranca en lo escrito, en los dos
 * modos: antes de contarlo no hay "lo que habia" al que sumarle. Un campo
 * vacio no cambia nada.
 */
export function planDeConteo(
  modo: ModoConteo,
  productos: ProductoContable[],
  valor: (clave: string) => string | null
): { ok: true; movimientos: MovimientoConteo[] } | { ok: false; error: string } {
  const movimientos: MovimientoConteo[] = [];
  for (const p of productos) {
    const raw = (valor(claveConteo(p)) ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, error: "Revisa " + p.name + ": escribe un número entero, 0 o más." };
    }
    if (n > MAXIMO) return { ok: false, error: "Revisa " + p.name + ": " + n + " unidades son demasiadas." };

    const base = { serviceId: p.serviceId, variantId: p.variantId, name: p.name };
    if (!p.contado) {
      // Si tenia una presentacion de antes (le quitaron el inventario y lo
      // vuelven a prender), su stock viejo se corrige al conteo de hoy.
      movimientos.push({ ...base, tipo: p.variantId ? "AJUSTE" : "ENTRADA", delta: n - (p.variantId ? p.stock : 0), inicial: true, queda: n });
    } else if (modo === "entrada") {
      if (n === 0) continue;
      movimientos.push({ ...base, tipo: "ENTRADA", delta: n, inicial: false, queda: p.stock + n });
    } else {
      if (n === p.stock) continue;
      movimientos.push({ ...base, tipo: "AJUSTE", delta: n - p.stock, inicial: false, queda: n });
    }
  }
  return { ok: true, movimientos };
}

export type LineaVendida = {
  /** Para juntar por producto aunque le hayan cambiado el nombre. */
  clave: string;
  producto: string;
  qty: number;
  total: number;
};

/** Cuanto se vendio de cada producto: lo que mas sale primero. */
export function vendidoPorProducto(lineas: LineaVendida[]): { clave: string; producto: string; qty: number; total: number }[] {
  const por = new Map<string, { clave: string; producto: string; qty: number; total: number }>();
  for (const l of lineas) {
    const ya = por.get(l.clave);
    if (ya) {
      ya.qty += l.qty;
      ya.total += l.total;
    } else {
      por.set(l.clave, { clave: l.clave, producto: l.producto, qty: l.qty, total: l.total });
    }
  }
  return [...por.values()].sort((a, b) => b.qty - a.qty || b.total - a.total || a.producto.localeCompare(b.producto));
}
