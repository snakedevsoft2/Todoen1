"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { str } from "@/lib/format";
import { applyStockMove } from "@/lib/inventory";

// Registrar una venta ya no pasa por aqui: va por /api/ventas (lib/ventas.ts),
// para que la venta hecha sin senal se guarde en el telefono y se suba sola.

const VALID_PAYMENTS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];

function readPayment(value: FormDataEntryValue | null): PaymentMethod {
  const v = String(value ?? "EFECTIVO") as PaymentMethod;
  return VALID_PAYMENTS.includes(v) ? v : "EFECTIVO";
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
