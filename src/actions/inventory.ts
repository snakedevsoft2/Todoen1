"use server";

import { revalidatePath } from "next/cache";
import type { StockMoveType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { parseIntSafe, parseMoney, str } from "@/lib/format";
import { applyStockMove, variantLabel } from "@/lib/inventory";
import { normalizeCode } from "@/lib/variants";

export type InventoryState = { error?: string; ok?: string } | undefined;

/** Todo lo que toca inventario refresca las mismas pantallas. */
function refresh() {
  revalidatePath("/panel/inventario");
  revalidatePath("/panel/catalogo");
  revalidatePath("/panel/ventas");
  revalidatePath("/panel");
}

/** Normaliza "  m " -> "M" y deja vacio como "Unica" / "Unico". */
function cleanSize(value: FormDataEntryValue | null) {
  const v = str(value);
  if (!v) return "Unica";
  return v.length <= 4 ? v.toUpperCase() : v;
}

function cleanColor(value: FormDataEntryValue | null) {
  const v = str(value);
  if (!v) return "Unico";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/**
 * Crea o edita una talla de una prenda.
 *
 * El stock no se edita aqui a proposito: se mueve con entradas, salidas o
 * ajustes para que el historial siempre explique por que cambio. La unica
 * excepcion es el stock inicial al crearla, que queda como una ENTRADA.
 */
export async function saveVariantAction(
  _prev: InventoryState,
  formData: FormData
): Promise<InventoryState> {
  const user = await requireUser();
  const id = str(formData.get("id"));
  const serviceId = str(formData.get("serviceId"));

  const service = await db.service.findFirst({ where: { id: serviceId, userId: user.id } });
  if (!service) return { error: "No encontramos esa prenda en tu catalogo." };

  const size = cleanSize(formData.get("size"));
  const color = cleanColor(formData.get("color"));
  const minStock = Math.max(0, parseIntSafe(formData.get("minStock"), 0));
  const cost = parseMoney(formData.get("cost"), user.currency);
  const rawPrice = str(formData.get("price"));
  const price = rawPrice ? parseMoney(rawPrice, user.currency) : null;
  const sku = normalizeCode(str(formData.get("sku"))) || null;

  if (price !== null && price < 0) return { error: "El precio no puede ser negativo." };

  const duplicate = await db.productVariant.findFirst({
    where: { serviceId: service.id, size, color, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (duplicate) {
    return { error: "Ya tienes la talla " + variantLabel({ size, color }) + " en esta prenda." };
  }

  // El codigo tiene que ser unico dentro del negocio: si dos tallas comparten
  // el mismo, escanear deja de servir porque no se sabe cual es cual.
  if (sku) {
    const usado = await db.productVariant.findFirst({
      where: { userId: user.id, sku, ...(id ? { NOT: { id } } : {}) },
      include: { service: { select: { name: true } } },
    });
    if (usado) {
      return {
        error:
          "El codigo " + sku + " ya esta en " + usado.service.name + " " + variantLabel(usado) + ".",
      };
    }
  }

  if (id) {
    const updated = await db.productVariant.updateMany({
      where: { id, userId: user.id },
      data: { size, color, minStock, cost, price, sku },
    });
    if (updated.count === 0) return { error: "No encontramos esa talla en tu inventario." };
    refresh();
    return { ok: "Talla actualizada." };
  }

  const initial = Math.max(0, parseIntSafe(formData.get("stock"), 0));
  const day = todayIn(user.timezone);

  await db.$transaction(async (tx) => {
    const created = await tx.productVariant.create({
      data: { userId: user.id, serviceId: service.id, size, color, minStock, cost, price, sku },
    });
    if (initial > 0) {
      await applyStockMove(tx, {
        userId: user.id,
        variantId: created.id,
        type: "ENTRADA",
        delta: initial,
        unitCost: cost,
        reason: "Stock inicial",
        day,
      });
    }
  });

  refresh();
  return { ok: "Talla agregada." };
}

/**
 * Crea varias tallas de un golpe: "S,M,L,XL" por cada color que escriban.
 * Es la forma normal de cargar una prenda nueva en una tienda de ropa.
 */
export async function createVariantsBulkAction(
  _prev: InventoryState,
  formData: FormData
): Promise<InventoryState> {
  const user = await requireUser();
  const serviceId = str(formData.get("serviceId"));
  const service = await db.service.findFirst({ where: { id: serviceId, userId: user.id } });
  if (!service) return { error: "No encontramos esa prenda en tu catalogo." };

  const split = (raw: string) =>
    raw
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 30);

  const sizes = split(str(formData.get("sizes")));
  const colors = split(str(formData.get("colors")));
  if (sizes.length === 0) return { error: "Escribe al menos una talla (ej: S, M, L)." };

  const finalColors = colors.length ? colors : ["Unico"];
  const perVariant = Math.max(0, parseIntSafe(formData.get("stock"), 0));
  const cost = parseMoney(formData.get("cost"), user.currency);
  const minStock = Math.max(0, parseIntSafe(formData.get("minStock"), 0));
  const day = todayIn(user.timezone);

  const existing = await db.productVariant.findMany({
    where: { serviceId: service.id },
    select: { size: true, color: true },
  });
  const taken = new Set(existing.map((v) => v.size + "|" + v.color));

  const pending: { size: string; color: string }[] = [];
  for (const rawSize of sizes) {
    for (const rawColor of finalColors) {
      const size = rawSize.length <= 4 ? rawSize.toUpperCase() : rawSize;
      const color = rawColor.charAt(0).toUpperCase() + rawColor.slice(1);
      if (taken.has(size + "|" + color)) continue;
      taken.add(size + "|" + color);
      pending.push({ size, color });
    }
  }

  if (pending.length === 0) return { error: "Esas tallas ya existen en la prenda." };
  if (pending.length > 100) return { error: "Son demasiadas combinaciones. Hazlo por partes." };

  await db.$transaction(async (tx) => {
    for (const combo of pending) {
      const created = await tx.productVariant.create({
        data: {
          userId: user.id,
          serviceId: service.id,
          size: combo.size,
          color: combo.color,
          minStock,
          cost,
        },
      });
      if (perVariant > 0) {
        await applyStockMove(tx, {
          userId: user.id,
          variantId: created.id,
          type: "ENTRADA",
          delta: perVariant,
          unitCost: cost,
          reason: "Carga inicial",
          day,
        });
      }
    }
  });

  refresh();
  return { ok: pending.length + (pending.length === 1 ? " talla creada." : " tallas creadas.") };
}

const MOVE_TYPES: StockMoveType[] = ["ENTRADA", "SALIDA", "AJUSTE"];

/**
 * Entrada (llego mercancia), salida (se daño, se regalo, se devolvio al
 * proveedor) o ajuste por conteo fisico.
 */
export async function stockMoveAction(
  _prev: InventoryState,
  formData: FormData
): Promise<InventoryState> {
  const user = await requireUser();
  const variantId = str(formData.get("variantId"));
  const rawType = str(formData.get("type")) as StockMoveType;
  if (!MOVE_TYPES.includes(rawType)) return { error: "Elige que tipo de movimiento es." };

  const variant = await db.productVariant.findFirst({
    where: { id: variantId, userId: user.id },
    include: { service: { select: { name: true } } },
  });
  if (!variant) return { error: "No encontramos esa talla en tu inventario." };

  const qty = parseIntSafe(formData.get("qty"), 0);
  const dayInput = str(formData.get("day"));
  const day = isValidDay(dayInput) ? dayInput : todayIn(user.timezone);
  const reason = str(formData.get("reason")) || null;
  const unitCost = parseMoney(formData.get("unitCost"), user.currency);

  let delta: number;
  if (rawType === "AJUSTE") {
    // En el ajuste la persona escribe cuantas conto de verdad, no la diferencia.
    if (qty < 0) return { error: "La cantidad contada no puede ser negativa." };
    delta = qty - variant.stock;
    if (delta === 0) return { error: "El conteo es igual al stock que ya tenias." };
  } else {
    if (qty <= 0) return { error: "La cantidad debe ser mayor a cero." };
    delta = rawType === "ENTRADA" ? qty : -qty;
  }

  // De quien vino la mercancia. Solo se guarda en las entradas: en una salida
  // o en un conteo no hay proveedor que valga.
  let supplierId: string | null = null;
  if (rawType === "ENTRADA") {
    const pedido = str(formData.get("supplierId"));
    if (pedido) {
      const supplier = await db.supplier.findFirst({
        where: { id: pedido, userId: user.id },
        select: { id: true },
      });
      supplierId = supplier?.id ?? null;
    }
  }

  const result = await db.$transaction((tx) =>
    applyStockMove(tx, {
      userId: user.id,
      variantId: variant.id,
      type: rawType,
      delta,
      day,
      unitCost: rawType === "ENTRADA" ? unitCost || variant.cost : variant.cost,
      reason,
      supplierId,
      // El conteo fisico manda: si conto menos, el stock baja aunque duela.
      blockNegative: rawType !== "AJUSTE",
    })
  );

  if (!result.ok) return { error: result.error };

  const label = variant.service.name + " " + variantLabel(variant);
  refresh();
  if (rawType === "AJUSTE") {
    return { ok: label + " quedo en " + result.stockAfter + " unidades." };
  }
  return {
    ok:
      (rawType === "ENTRADA" ? "Entraron " : "Salieron ") +
      Math.abs(delta) +
      " de " +
      label +
      ". Quedan " +
      result.stockAfter +
      ".",
  };
}

/**
 * Los botones + y - de cada fila del inventario.
 *
 * Mueve una sola unidad sin abrir formulario, que es lo que mas se usa cuando
 * llega mercancia suelta o se daña una prenda. Si no alcanza el stock no hace
 * nada: la fila ya muestra cuantas quedan.
 */
export async function quickStockAction(formData: FormData) {
  const user = await requireUser();
  const variantId = str(formData.get("variantId"));
  const delta = parseIntSafe(formData.get("delta"), 0);
  if (delta === 0) return;

  await db.$transaction((tx) =>
    applyStockMove(tx, {
      userId: user.id,
      variantId,
      type: delta > 0 ? "ENTRADA" : "SALIDA",
      delta,
      day: todayIn(user.timezone),
      reason: "Ajuste rapido",
    })
  );

  refresh();
}

export async function toggleVariantAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));
  const variant = await db.productVariant.findFirst({ where: { id, userId: user.id } });
  if (!variant) return;
  await db.productVariant.update({
    where: { id: variant.id },
    data: { active: !variant.active },
  });
  refresh();
}

export async function deleteVariantAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));
  await db.productVariant.deleteMany({ where: { id, userId: user.id } });
  refresh();
}
