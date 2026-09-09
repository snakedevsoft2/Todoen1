"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { parseIntSafe, parseMoney, str } from "@/lib/format";

export type OrderState = { error?: string; ok?: string } | undefined;

const VALID_PAYMENTS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];

function readPayment(value: FormDataEntryValue | null): PaymentMethod {
  const v = String(value ?? "EFECTIVO") as PaymentMethod;
  return VALID_PAYMENTS.includes(v) ? v : "EFECTIVO";
}

/** Abre una cuenta nueva (mesa, domicilio, mostrador). */
export async function createOrderAction(_prev: OrderState, formData: FormData): Promise<OrderState> {
  const user = await requireUser();
  const label = str(formData.get("label"));
  if (!label) return { error: "Ponle un nombre a la cuenta (ej: Mesa 4)." };

  await db.order.create({
    data: {
      userId: user.id,
      label,
      day: todayIn(user.timezone),
      notes: str(formData.get("notes")) || null,
    },
  });

  revalidatePath("/panel/cuentas");
  revalidatePath("/panel");
  return { ok: "Cuenta abierta." };
}

/** Agrega un producto del catalogo (o uno libre) a una cuenta abierta. */
export async function addOrderItemAction(formData: FormData) {
  const user = await requireUser();
  const orderId = str(formData.get("orderId"));
  const order = await db.order.findFirst({ where: { id: orderId, userId: user.id } });
  if (!order || order.status !== "ABIERTA") return;

  const qty = Math.max(1, parseIntSafe(formData.get("qty"), 1));
  const serviceId = str(formData.get("serviceId"));

  if (serviceId) {
    const service = await db.service.findFirst({ where: { id: serviceId, userId: user.id } });
    if (!service) return;
    const existing = await db.orderItem.findFirst({ where: { orderId: order.id, serviceId: service.id } });
    if (existing) {
      await db.orderItem.update({ where: { id: existing.id }, data: { qty: existing.qty + qty } });
    } else {
      await db.orderItem.create({
        data: {
          userId: user.id,
          orderId: order.id,
          serviceId: service.id,
          name: service.name,
          unitPrice: service.price,
          qty,
        },
      });
    }
  } else {
    const name = str(formData.get("name"));
    const unitPrice = parseMoney(formData.get("unitPrice"));
    if (!name || unitPrice <= 0) return;
    await db.orderItem.create({ data: { userId: user.id, orderId: order.id, name, unitPrice, qty } });
  }

  revalidatePath("/panel/cuentas");
  revalidatePath("/panel/cuentas/" + order.id);
}

export async function changeOrderItemQtyAction(formData: FormData) {
  const user = await requireUser();
  const itemId = str(formData.get("itemId"));
  const delta = parseIntSafe(formData.get("delta"), 0);
  const item = await db.orderItem.findFirst({
    where: { id: itemId, order: { userId: user.id, status: "ABIERTA" } },
    include: { order: true },
  });
  if (!item) return;

  const next = item.qty + delta;
  if (next <= 0) {
    await db.orderItem.delete({ where: { id: item.id } });
  } else {
    await db.orderItem.update({ where: { id: item.id }, data: { qty: next } });
  }

  revalidatePath("/panel/cuentas");
  revalidatePath("/panel/cuentas/" + item.orderId);
}

export async function removeOrderItemAction(formData: FormData) {
  const user = await requireUser();
  const itemId = str(formData.get("itemId"));
  const item = await db.orderItem.findFirst({
    where: { id: itemId, order: { userId: user.id, status: "ABIERTA" } },
  });
  if (!item) return;
  await db.orderItem.delete({ where: { id: item.id } });
  revalidatePath("/panel/cuentas");
  revalidatePath("/panel/cuentas/" + item.orderId);
}

/** Cierra la cuenta y la convierte en venta del dia. */
export async function closeOrderAction(formData: FormData) {
  const user = await requireUser();
  const orderId = str(formData.get("orderId"));
  const order = await db.order.findFirst({
    where: { id: orderId, userId: user.id },
    include: { items: true, sale: true },
  });
  if (!order || order.status !== "ABIERTA" || order.sale) return;
  if (order.items.length === 0) return;

  const computed = order.items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  const discount = Math.max(0, parseMoney(formData.get("discount")));
  const total = Math.max(0, computed - discount);
  const paymentMethod = readPayment(formData.get("paymentMethod"));

  await db.$transaction([
    db.sale.create({
      data: {
        userId: user.id,
        day: order.day,
        total,
        paymentMethod,
        origin: "ORDEN",
        clientName: order.label,
        notes: discount > 0 ? "Descuento aplicado: " + discount : null,
        orderId: order.id,
        items: {
          create: order.items.map((i) => ({
            userId: user.id,
            serviceId: i.serviceId,
            name: i.name,
            unitPrice: i.unitPrice,
            qty: i.qty,
          })),
        },
      },
    }),
    db.order.update({ where: { id: order.id }, data: { status: "PAGADA" } }),
  ]);

  revalidatePath("/panel/cuentas");
  revalidatePath("/panel/ventas");
  revalidatePath("/panel");
}

export async function cancelOrderAction(formData: FormData) {
  const user = await requireUser();
  const orderId = str(formData.get("orderId"));
  await db.order.updateMany({
    where: { id: orderId, userId: user.id, status: "ABIERTA" },
    data: { status: "CANCELADA" },
  });
  revalidatePath("/panel/cuentas");
  revalidatePath("/panel");
}

export async function deleteOrderAction(formData: FormData) {
  const user = await requireUser();
  const orderId = str(formData.get("orderId"));
  await db.order.deleteMany({ where: { id: orderId, userId: user.id, status: { not: "PAGADA" } } });
  revalidatePath("/panel/cuentas");
}
