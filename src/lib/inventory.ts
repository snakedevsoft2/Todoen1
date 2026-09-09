import type { Prisma, StockMoveType } from "@prisma/client";
import { db } from "./db";
import { variantLabel } from "./variants";

// Las ayudas puras viven en variants.ts para que los componentes del navegador
// las puedan usar sin arrastrar Prisma. Se reexportan para el lado del servidor.
export { variantLabel, variantPrice, SIZE_PRESETS, NUMERIC_SIZES, COLOR_PRESETS } from "./variants";

export type StockMoveInput = {
  userId: string;
  variantId: string;
  type: StockMoveType;
  /** Positivo entra, negativo sale. */
  delta: number;
  day: string;
  unitCost?: number;
  reason?: string | null;
  saleId?: string | null;
  /** De quien vino la mercancia. Solo aplica a las entradas. */
  supplierId?: string | null;
  /** Si es false, deja que el stock quede negativo (solo para ajustes). */
  blockNegative?: boolean;
};

export type StockMoveResult = { ok: true; stockAfter: number } | { ok: false; error: string };

/**
 * Mueve el stock de una talla y deja el rastro en el historial.
 *
 * Va siempre dentro de una transaccion para que el stock y el movimiento
 * queden juntos o no queden. El `where` incluye el userId: nadie puede tocar
 * el inventario de otro negocio ni conociendo el id de la talla.
 */
export async function applyStockMove(
  tx: Prisma.TransactionClient,
  input: StockMoveInput
): Promise<StockMoveResult> {
  const variant = await tx.productVariant.findFirst({
    where: { id: input.variantId, userId: input.userId },
    include: { service: { select: { name: true } } },
  });
  if (!variant) return { ok: false, error: "No encontramos esa talla en tu inventario." };

  const stockAfter = variant.stock + input.delta;
  if (stockAfter < 0 && input.blockNegative !== false) {
    const label = variant.service.name + " " + variantLabel(variant);
    return {
      ok: false,
      error:
        "No alcanza el stock de " + label + ". Quedan " + variant.stock + " y pediste " + Math.abs(input.delta) + ".",
    };
  }

  await tx.productVariant.update({
    where: { id: variant.id },
    data: {
      stock: stockAfter,
      // Guardamos el costo de la ultima entrada para valorizar el inventario.
      ...(input.type === "ENTRADA" && input.unitCost ? { cost: input.unitCost } : {}),
    },
  });

  await tx.stockMove.create({
    data: {
      userId: input.userId,
      variantId: variant.id,
      type: input.type,
      delta: input.delta,
      stockAfter,
      unitCost: input.unitCost ?? variant.cost,
      reason: input.reason ?? null,
      day: input.day,
      saleId: input.saleId ?? null,
      supplierId: input.supplierId ?? null,
    },
  });

  return { ok: true, stockAfter };
}

export type InventorySummary = {
  /** Prendas fisicas contando todas las tallas. */
  units: number;
  /** Cuanto vale lo que hay, al costo. */
  costValue: number;
  /** Cuanto entraria si se vendiera todo. */
  saleValue: number;
  variantCount: number;
  lowCount: number;
  outCount: number;
};

/** Cuanto hay y cuanto vale el inventario del negocio. */
export async function getInventorySummary(userId: string): Promise<InventorySummary> {
  const variants = await db.productVariant.findMany({
    where: { userId, active: true },
    select: { stock: true, minStock: true, cost: true, price: true, service: { select: { price: true } } },
  });

  let units = 0;
  let costValue = 0;
  let saleValue = 0;
  let lowCount = 0;
  let outCount = 0;

  for (const v of variants) {
    const stock = Math.max(0, v.stock);
    units += stock;
    costValue += stock * v.cost;
    saleValue += stock * (v.price ?? v.service.price);
    if (v.stock <= 0) outCount += 1;
    else if (v.stock <= v.minStock) lowCount += 1;
  }

  return { units, costValue, saleValue, variantCount: variants.length, lowCount, outCount };
}

/** Tallas agotadas o por debajo del minimo, para avisar antes de que falten. */
export async function getLowStock(userId: string, limit = 50) {
  const variants = await db.productVariant.findMany({
    where: { userId, active: true, service: { active: true } },
    include: { service: { select: { id: true, name: true, category: true, price: true } } },
    orderBy: { stock: "asc" },
    take: 200,
  });

  return variants
    .filter((v) => v.stock <= v.minStock)
    .sort((a, b) => a.stock - b.stock || a.service.name.localeCompare(b.service.name))
    .slice(0, limit);
}

/** Cuantas tallas estan en rojo. Se usa para el aviso del resumen del dia. */
export async function countLowStock(userId: string): Promise<number> {
  const rows = await db.productVariant.findMany({
    where: { userId, active: true, service: { active: true } },
    select: { stock: true, minStock: true },
  });
  return rows.filter((v) => v.stock <= v.minStock).length;
}
