"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, requireUser } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { parseMoney, str } from "@/lib/format";

export type SaleState = { error?: string; ok?: string } | undefined;

const VALID_PAYMENTS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];

function readPayment(value: FormDataEntryValue | null): PaymentMethod {
  const v = String(value ?? "EFECTIVO") as PaymentMethod;
  return VALID_PAYMENTS.includes(v) ? v : "EFECTIVO";
}

type CartItem = { serviceId?: string | null; name: string; unitPrice: number; qty: number };

function parseCart(raw: string): CartItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        serviceId: typeof row?.serviceId === "string" && row.serviceId ? row.serviceId : null,
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
  const manualTotal = parseMoney(formData.get("manualTotal"));

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

  // La venta queda a nombre del barbero elegido, o de quien la esta registrando.
  const staffId = str(formData.get("staffId"));
  const staff = staffId
    ? await db.staff.findFirst({ where: { id: staffId, userId: user.id }, select: { id: true } })
    : null;

  await db.sale.create({
    data: {
      userId: user.id,
      day,
      total,
      staffId: staff?.id ?? me.id,
      paymentMethod: readPayment(formData.get("paymentMethod")),
      origin: "MANUAL",
      clientName: str(formData.get("clientName")) || null,
      notes: str(formData.get("notes")) || null,
      items: {
        create: (items.length > 0
          ? items
          : [{ serviceId: null, name: str(formData.get("concept"), "Venta"), unitPrice: total, qty: 1 }]
        ).map((i) => ({
          serviceId: i.serviceId && owned.has(i.serviceId) ? i.serviceId : null,
          name: i.name,
          unitPrice: i.unitPrice,
          qty: i.qty,
        })),
      },
    },
  });

  revalidatePath("/panel/ventas");
  revalidatePath("/panel");
  return { ok: "Venta registrada." };
}

export async function deleteSaleAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));
  const sale = await db.sale.findFirst({ where: { id, userId: user.id } });
  if (!sale) return;

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
    await tx.sale.delete({ where: { id: sale.id } });
  });

  revalidatePath("/panel/ventas");
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/cuentas");
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
