"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOwner, requireSession } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { parseIntSafe, parseMoney, str } from "@/lib/format";
import { anotarActividad } from "@/lib/actividad";
import { nextReceiptSeq } from "@/lib/receipt-seq";

export type OrderState = { error?: string; ok?: string } | undefined;

const VALID_PAYMENTS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];

function readPayment(value: FormDataEntryValue | null): PaymentMethod {
  const v = String(value ?? "EFECTIVO") as PaymentMethod;
  return VALID_PAYMENTS.includes(v) ? v : "EFECTIVO";
}

/** Abre una cuenta nueva (mesa, domicilio, mostrador). */
export async function createOrderAction(_prev: OrderState, formData: FormData): Promise<OrderState> {
  const { user, staff } = await requireSession();
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
  await anotarActividad({ user, staff }, { tipo: "cuenta", detalle: "Abrió la cuenta " + label });

  revalidatePath("/panel/cuentas");
  revalidatePath("/panel");
  return { ok: "Cuenta abierta." };
}

/**
 * Agrega un producto del catalogo (o uno libre) a una cuenta abierta.
 *
 * Mientras la cuenta esta abierta el empleado la arma: agrega, cambia
 * cantidades y quita. Todo queda en su historial. Cancelarla o borrarla es del
 * dueño.
 */
export async function addOrderItemAction(formData: FormData) {
  const { user, staff } = await requireSession();
  const orderId = str(formData.get("orderId"));
  const order = await db.order.findFirst({ where: { id: orderId, userId: user.id } });
  if (!order || order.status !== "ABIERTA") return;

  const qty = Math.max(1, parseIntSafe(formData.get("qty"), 1));
  const serviceId = str(formData.get("serviceId"));
  let agregado: { name: string; unitPrice: number };

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
    agregado = { name: service.name, unitPrice: service.price };
  } else {
    const name = str(formData.get("name"));
    const unitPrice = parseMoney(formData.get("unitPrice"), user.currency);
    if (!name || unitPrice <= 0) return;
    await db.orderItem.create({ data: { userId: user.id, orderId: order.id, name, unitPrice, qty } });
    agregado = { name, unitPrice };
  }
  await anotarActividad(
    { user, staff },
    { tipo: "cuenta", detalle: "Agregó " + qty + " x " + agregado.name + " a " + order.label, monto: agregado.unitPrice * qty }
  );

  revalidatePath("/panel/cuentas");
  revalidatePath("/panel/cuentas/" + order.id);
}

export async function changeOrderItemQtyAction(formData: FormData) {
  const { user, staff } = await requireSession();
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
  await anotarActividad(
    { user, staff },
    {
      tipo: "cuenta",
      detalle: next <= 0 ? "Quitó " + item.name + " de " + item.order.label : "Dejó " + next + " x " + item.name + " en " + item.order.label,
    }
  );

  revalidatePath("/panel/cuentas");
  revalidatePath("/panel/cuentas/" + item.orderId);
}

export async function removeOrderItemAction(formData: FormData) {
  const { user, staff } = await requireSession();
  const itemId = str(formData.get("itemId"));
  const item = await db.orderItem.findFirst({
    where: { id: itemId, order: { userId: user.id, status: "ABIERTA" } },
    include: { order: { select: { label: true } } },
  });
  if (!item) return;
  await db.orderItem.delete({ where: { id: item.id } });
  await anotarActividad({ user, staff }, { tipo: "cuenta", detalle: "Quitó " + item.name + " de " + item.order.label });
  revalidatePath("/panel/cuentas");
  revalidatePath("/panel/cuentas/" + item.orderId);
}

/** Cierra la cuenta y la convierte en venta del dia, a nombre de quien la cobra. */
export async function closeOrderAction(formData: FormData) {
  const { user, staff } = await requireSession();
  const orderId = str(formData.get("orderId"));
  const order = await db.order.findFirst({
    where: { id: orderId, userId: user.id },
    include: { items: true, sale: true },
  });
  if (!order || order.status !== "ABIERTA" || order.sale) return;
  if (order.items.length === 0) return;

  const computed = order.items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  const discount = Math.max(0, parseMoney(formData.get("discount"), user.currency));
  const total = Math.max(0, computed - discount);
  const paymentMethod = readPayment(formData.get("paymentMethod"));

  await db.$transaction(async (tx) => {
    await tx.sale.create({
      data: {
        userId: user.id,
        day: order.day,
        total,
        staffId: staff.id,
        paymentMethod,
        origin: "ORDEN",
        clientName: order.label,
        notes: discount > 0 ? "Descuento aplicado: " + discount : null,
        orderId: order.id,
        receiptSeq: await nextReceiptSeq(tx, user.id),
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
    });
    await tx.order.update({ where: { id: order.id }, data: { status: "PAGADA" } });
  });
  await anotarActividad(
    { user, staff },
    { tipo: "cobro", detalle: "Cobró la cuenta " + order.label + (discount > 0 ? " con descuento" : ""), monto: total }
  );

  revalidatePath("/panel/cuentas");
  revalidatePath("/panel/ventas");
  revalidatePath("/panel");
}

/** Cancelar una cuenta abierta es solo del dueño. */
export async function cancelOrderAction(formData: FormData) {
  const { user, staff } = await requireOwner();
  const orderId = str(formData.get("orderId"));
  const orden = await db.order.findFirst({ where: { id: orderId, userId: user.id, status: "ABIERTA" }, select: { label: true } });
  if (!orden) return;
  await db.order.updateMany({
    where: { id: orderId, userId: user.id, status: "ABIERTA" },
    data: { status: "CANCELADA" },
  });
  await anotarActividad({ user, staff }, { tipo: "cambio", detalle: "Canceló la cuenta " + orden.label });
  revalidatePath("/panel/cuentas");
  revalidatePath("/panel");
}

/** Borrar una cuenta que no se cobro es solo del dueño. */
export async function deleteOrderAction(formData: FormData) {
  const { user, staff } = await requireOwner();
  const orderId = str(formData.get("orderId"));
  const orden = await db.order.findFirst({
    where: { id: orderId, userId: user.id, status: { not: "PAGADA" } },
    select: { label: true },
  });
  if (!orden) return;
  await db.order.deleteMany({ where: { id: orderId, userId: user.id, status: { not: "PAGADA" } } });
  await anotarActividad({ user, staff }, { tipo: "borrado", detalle: "Borró la cuenta " + orden.label });
  revalidatePath("/panel/cuentas");
}
