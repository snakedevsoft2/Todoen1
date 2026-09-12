"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, requireUser } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { parseMoney, str } from "@/lib/format";
import { applyStockMove, variantLabel } from "@/lib/inventory";

export type SaleState = { error?: string; ok?: string } | undefined;

const VALID_PAYMENTS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];

function readPayment(value: FormDataEntryValue | null): PaymentMethod {
  const v = String(value ?? "EFECTIVO") as PaymentMethod;
  return VALID_PAYMENTS.includes(v) ? v : "EFECTIVO";
}

type CartItem = {
  serviceId?: string | null;
  /** Talla vendida, cuando la prenda lleva inventario. */
  variantId?: string | null;
  name: string;
  unitPrice: number;
  qty: number;
};

function parseCart(raw: string): CartItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        serviceId: typeof row?.serviceId === "string" && row.serviceId ? row.serviceId : null,
        variantId: typeof row?.variantId === "string" && row.variantId ? row.variantId : null,
        name: String(row?.name ?? "").trim(),
        unitPrice: Math.max(0, Math.round(Number(row?.unitPrice) || 0)),
        qty: Math.max(1, Math.round(Number(row?.qty) || 1)),
      }))
      .filter((row) => row.name.length > 0)
      .slice(0, 100);
  } catch {
    return [];
  }
}

/**
 * Registra una venta del dia. Sirve para la barberia ("agregar corte hecho")
 * y para el restaurante o comidas rapidas cuando venden sin abrir cuenta.
 */
export async function createSaleAction(_prev: SaleState, formData: FormData): Promise<SaleState> {
  const { user, staff: me } = await requireSession();
  const items = parseCart(str(formData.get("itemsJson")));
  const manualTotal = parseMoney(formData.get("manualTotal"), user.currency);

  if (items.length === 0 && manualTotal <= 0) {
    return { error: "Agrega al menos un item o escribe un valor." };
  }

  const dayInput = str(formData.get("day"));
  const day = isValidDay(dayInput) ? dayInput : todayIn(user.timezone);
  const computed = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  const total = items.length > 0 ? computed : manualTotal;

  // Verificamos que los servicios enviados sean realmente de este negocio.
  const ids = items.map((i) => i.serviceId).filter((v): v is string => Boolean(v));
  const owned = ids.length
    ? new Set(
        (await db.service.findMany({ where: { id: { in: ids }, userId: user.id }, select: { id: true } })).map(
          (s) => s.id
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
      return {
        error:
          "No alcanza el stock de " +
          variant.service.name +
          " " +
          variantLabel(variant) +
          ". Quedan " +
          variant.stock +
          " y pediste " +
          qty +
          ".",
      };
    }
  }

  // La venta queda a nombre del barbero elegido, o de quien la esta registrando.
  const staffId = str(formData.get("staffId"));
  const staff = staffId
    ? await db.staff.findFirst({ where: { id: staffId, userId: user.id }, select: { id: true } })
    : null;

  const rows = (
    items.length > 0
      ? items
      : [{ serviceId: null, variantId: null, name: str(formData.get("concept"), "Venta"), unitPrice: total, qty: 1 }]
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

  try {
    // La venta y el descuento de stock van juntos: o quedan los dos, o ninguno.
    await db.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          userId: user.id,
          day,
          total,
          staffId: staff?.id ?? me.id,
          paymentMethod: readPayment(formData.get("paymentMethod")),
          origin: "MANUAL",
          clientName: str(formData.get("clientName")) || null,
          notes: str(formData.get("notes")) || null,
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
        if (!moved.ok) throw new Error(moved.error);
      }
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No pudimos guardar la venta." };
  }

  revalidatePath("/panel/ventas");
  revalidatePath("/panel/inventario");
  revalidatePath("/panel");
  return { ok: "Venta registrada." };
}

export async function deleteSaleAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));
  const sale = await db.sale.findFirst({
    where: { id, userId: user.id },
    include: { items: { select: { variantId: true, qty: true } } },
  });
  if (!sale) return;

  // Lo que se vendio por talla vuelve al inventario al borrar la venta.
  const back = new Map<string, number>();
  for (const item of sale.items) {
    if (!item.variantId) continue;
    back.set(item.variantId, (back.get(item.variantId) ?? 0) + item.qty);
  }

  await db.$transaction(async (tx) => {
    if (sale.appointmentId) {
      await tx.appointment.updateMany({
        where: { id: sale.appointmentId, userId: user.id },
        data: { status: "CONFIRMADO" },
      });
    }
    if (sale.orderId) {
      await tx.order.updateMany({
        where: { id: sale.orderId, userId: user.id },
        data: { status: "ABIERTA" },
      });
    }
    for (const [variantId, qty] of back) {
      await applyStockMove(tx, {
        userId: user.id,
        variantId,
        type: "DEVOLUCION",
        delta: qty,
        day: sale.day,
        reason: "Venta borrada",
        saleId: sale.id,
      });
    }
    await tx.sale.delete({ where: { id: sale.id } });
  });

  revalidatePath("/panel/ventas");
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/cuentas");
  revalidatePath("/panel/inventario");
  revalidatePath("/panel");
}

export async function updateSalePaymentAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));
  await db.sale.updateMany({
    where: { id, userId: user.id },
    data: { paymentMethod: readPayment(formData.get("paymentMethod")) },
  });
  revalidatePath("/panel/ventas");
  revalidatePath("/panel/caja");
}
