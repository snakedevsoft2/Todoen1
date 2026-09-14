import type { PaymentMethod } from "@prisma/client";
import { db } from "./db";
import { isValidDay, todayIn } from "./dates";
import { parseMoney } from "./format";
import { applyStockMove, variantLabel } from "./inventory";
import { LLAVE_VALIDA, falla, textoDe, type Resultado, type Sesion } from "./informes";

/**
 * Registrar una venta directa, con senal o sin ella.
 *
 * Lo usa la ruta que recibe las ventas del telefono (/api/ventas). La venta
 * hecha sin senal llega mas tarde con su llave: si ya estaba (la subida
 * anterior se corto antes de confirmar), se responde la misma venta en vez de
 * registrarla y descontar el inventario dos veces.
 */

const PAGOS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];

export type LineaVenta = {
  serviceId: string | null;
  /** Talla vendida, cuando la prenda lleva inventario. */
  variantId: string | null;
  name: string;
  unitPrice: number;
  qty: number;
};

/** Falta inventario: es culpa de lo que se manda, no del servidor. No se reintenta. */
class SinStock extends Error {}

export function leerCarrito(raw: unknown): LineaVenta[] {
  let lista = raw;
  if (typeof raw === "string") {
    try {
      lista = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  return lista
    .map((row: Record<string, unknown> | null) => ({
      serviceId: typeof row?.serviceId === "string" && row.serviceId ? row.serviceId : null,
      variantId: typeof row?.variantId === "string" && row.variantId ? row.variantId : null,
      name: String(row?.name ?? "").trim().slice(0, 200),
      unitPrice: Math.max(0, Math.round(Number(row?.unitPrice) || 0)),
      qty: Math.max(1, Math.round(Number(row?.qty) || 1)),
    }))
    .filter((row) => row.name.length > 0)
    .slice(0, 100);
}

export async function registrarVenta(
  s: Sesion,
  d: Record<string, unknown>
): Promise<Resultado<{ id: string; repetido: boolean }>> {
  const { user } = s;
  const clientKey = typeof d.clientKey === "string" && LLAVE_VALIDA.test(d.clientKey) ? d.clientKey : null;
  if (d.clientKey !== undefined && d.clientKey !== null && !clientKey) return falla("Llave inválida.");

  const yaEsta = async () => {
    if (!clientKey) return null;
    const ya = await db.sale.findUnique({ where: { clientKey }, select: { id: true, userId: true } });
    if (!ya) return null;
    return ya.userId === user.id
      ? { ok: true as const, datos: { id: ya.id, repetido: true } }
      : falla("Esa venta no se puede recibir.", 409);
  };
  const previo = await yaEsta();
  if (previo) return previo;

  const items = leerCarrito(d.items);
  const manual = typeof d.manualTotal === "string" || typeof d.manualTotal === "number" ? String(d.manualTotal) : null;
  const manualTotal = parseMoney(manual, user.currency);
  if (items.length === 0 && manualTotal <= 0) {
    return falla("Agrega al menos un item o escribe un valor.");
  }

  const dayInput = textoDe(d.day, 10);
  const day = isValidDay(dayInput) ? dayInput : todayIn(user.timezone);
  const computed = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  const total = items.length > 0 ? computed : manualTotal;

  // Verificamos que los servicios enviados sean realmente de este negocio.
  const ids = items.map((i) => i.serviceId).filter((v): v is string => Boolean(v));
  const owned = ids.length
    ? new Set(
        (await db.service.findMany({ where: { id: { in: ids }, userId: user.id }, select: { id: true } })).map(
          (x) => x.id
        )
      )
    : new Set<string>();

  // Igual con las tallas: solo se descuenta inventario de este negocio.
  const variantIds = items.map((i) => i.variantId).filter((v): v is string => Boolean(v));
  const variants = variantIds.length
    ? await db.productVariant.findMany({
        where: { id: { in: variantIds }, userId: user.id },
        include: { service: { select: { name: true } } },
      })
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));

  // La misma talla puede venir en dos lineas: se suma antes de revisar el stock.
  const needed = new Map<string, number>();
  for (const item of items) {
    if (!item.variantId || !variantById.has(item.variantId)) continue;
    needed.set(item.variantId, (needed.get(item.variantId) ?? 0) + item.qty);
  }
  for (const [id, qty] of needed) {
    const variant = variantById.get(id)!;
    if (variant.stock < qty) {
      return falla(
        "No alcanza el stock de " +
          variant.service.name +
          " " +
          variantLabel(variant) +
          ". Quedan " +
          variant.stock +
          " y pediste " +
          qty +
          "."
      );
    }
  }

  // La venta queda a nombre de la persona elegida, o de quien la registra.
  const staffId = textoDe(d.staffId, 40);
  const staff = staffId
    ? await db.staff.findFirst({ where: { id: staffId, userId: user.id }, select: { id: true } })
    : null;

  const rows = (
    items.length > 0
      ? items
      : [{ serviceId: null, variantId: null, name: textoDe(d.concept, 200) || "Venta", unitPrice: total, qty: 1 }]
  ).map((i) => {
    const variant = i.variantId ? variantById.get(i.variantId) : undefined;
    return {
      userId: user.id,
      serviceId: i.serviceId && owned.has(i.serviceId) ? i.serviceId : null,
      variantId: variant?.id ?? null,
      variantLabel: variant ? variantLabel(variant) : null,
      name: i.name,
      unitPrice: i.unitPrice,
      qty: i.qty,
    };
  });

  const pago = PAGOS.includes(d.paymentMethod as PaymentMethod) ? (d.paymentMethod as PaymentMethod) : "EFECTIVO";

  let venta;
  try {
    // La venta y el descuento de stock van juntos: o quedan los dos, o ninguno.
    venta = await db.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          userId: user.id,
          day,
          total,
          staffId: staff?.id ?? s.staff.id,
          paymentMethod: pago,
          origin: "MANUAL",
          clientName: textoDe(d.clientName, 200) || null,
          notes: textoDe(d.notes, 200) || null,
          clientKey,
          items: { create: rows },
        },
      });

      for (const [variantId, qty] of needed) {
        const moved = await applyStockMove(tx, {
          userId: user.id,
          variantId,
          type: "VENTA",
          delta: -qty,
          day,
          reason: "Venta",
          saleId: sale.id,
        });
        if (!moved.ok) throw new SinStock(moved.error);
      }
      return sale;
    });
  } catch (e) {
    if (e instanceof SinStock) return falla(e.message);
    // Dos subidas de la misma venta a la vez: gana una y la otra responde lo mismo.
    if ((e as { code?: string })?.code === "P2002") {
      const carrera = await yaEsta();
      if (carrera) return carrera;
    }
    throw e;
  }

  return { ok: true, datos: { id: venta.id, repetido: false } };
}
