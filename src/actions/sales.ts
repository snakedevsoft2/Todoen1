"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { isValidDay } from "@/lib/dates";
import { str } from "@/lib/format";
import { applyStockMove } from "@/lib/inventory";
import { anotarActividad } from "@/lib/actividad";
import { puedeHacer } from "@/lib/permisos-empleado";

// Registrar una venta ya no pasa por aqui: va por /api/ventas (lib/ventas.ts),
// para que la venta hecha sin senal se guarde en el telefono y se suba sola.
//
// Borrar una venta o cambiarle el pago es del dueño, y del jefe de patio del
// lavadero (ver ACCIONES_SUPERVISOR en lib/permisos-empleado): el resto de
// empleados no puede, por eso el chequeo es con puedeHacer() y no requireOwner().

const VALID_PAYMENTS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];

const PAGO_LABEL: Record<string, string> = {
  EFECTIVO: "efectivo",
  TARJETA: "tarjeta",
  TRANSFERENCIA: "transferencia",
  OTRO: "otro",
};

function readPayment(value: FormDataEntryValue | null): PaymentMethod {
  const v = String(value ?? "EFECTIVO") as PaymentMethod;
  return VALID_PAYMENTS.includes(v) ? v : "EFECTIVO";
}

export async function deleteSaleAction(formData: FormData) {
  const { user, staff } = await requireSession();
  if (!puedeHacer(staff.role, "deleteSaleAction")) return;
  const id = str(formData.get("id"));
  const sale = await db.sale.findFirst({
    where: { id, userId: user.id },
    include: {
      items: { select: { variantId: true, qty: true } },
      electronicInvoice: { select: { status: true } },
    },
  });
  if (!sale) return;
  // Una venta con factura autorizada, o camino a serlo, no se borra: ante la
  // DIAN o el SRI una factura emitida se anula con una nota credito.
  const factura = sale.electronicInvoice?.status;
  if (factura === "AUTORIZADA" || factura === "ENVIANDO") return;

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
    // La factura rechazada o con error no llego a existir ante la entidad.
    await tx.electronicInvoice.deleteMany({ where: { saleId: sale.id } });
    await tx.sale.delete({ where: { id: sale.id } });
  });

  await anotarActividad(
    { user, staff },
    {
      tipo: "borrado",
      detalle: "Borró una venta del " + sale.day + (sale.clientName ? " (" + sale.clientName + ")" : ""),
      monto: sale.total,
    }
  );

  revalidatePath("/panel/ventas");
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/cuentas");
  revalidatePath("/panel/inventario");
  revalidatePath("/panel");
}

/**
 * Corrige los datos de una venta ya registrada: cliente, día y nota.
 *
 * No toca los items, el total ni el inventario a propósito: eso significaría
 * deshacer y rehacer los movimientos de stock, con el riesgo de descuadrar el
 * inventario si algo sale mal a la mitad. Para corregir el monto o lo que se
 * vendió, la vía sigue siendo borrar y volver a registrar (deleteSaleAction ya
 * devuelve las prendas al inventario solo).
 */
export async function updateSaleAction(formData: FormData) {
  const { user, staff } = await requireSession();
  if (!puedeHacer(staff.role, "updateSaleAction")) return;
  const id = str(formData.get("id"));

  const sale = await db.sale.findFirst({
    where: { id, userId: user.id },
    select: { id: true, day: true, electronicInvoice: { select: { status: true } } },
  });
  if (!sale) return;
  // Igual que al borrar: una factura autorizada o en camino no se toca por
  // fuera de la entidad que la emitio.
  const factura = sale.electronicInvoice?.status;
  if (factura === "AUTORIZADA" || factura === "ENVIANDO") return;

  const dayInput = str(formData.get("day"));
  const day = isValidDay(dayInput) ? dayInput : sale.day;
  const clientName = str(formData.get("clientName")) || null;
  const notes = str(formData.get("notes")) || null;

  await db.sale.update({ where: { id: sale.id }, data: { day, clientName, notes } });

  await anotarActividad({ user, staff }, { tipo: "cambio", detalle: "Editó una venta del " + day });

  revalidatePath("/panel/ventas");
  revalidatePath("/panel");
}

export async function updateSalePaymentAction(formData: FormData) {
  const { user, staff } = await requireSession();
  if (!puedeHacer(staff.role, "updateSalePaymentAction")) return;
  const id = str(formData.get("id"));
  const pago = readPayment(formData.get("paymentMethod"));
  const r = await db.sale.updateMany({
    where: { id, userId: user.id },
    data: { paymentMethod: pago },
  });
  if (r.count > 0) {
    await anotarActividad({ user, staff }, { tipo: "cambio", detalle: "Cambió la forma de pago de una venta a " + PAGO_LABEL[pago] });
  }
  revalidatePath("/panel/ventas");
  revalidatePath("/panel/caja");
}
