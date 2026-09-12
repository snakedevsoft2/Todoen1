"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession, requireUser } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { parseIntSafe, parseMoney, str, texto } from "@/lib/format";
import { saldo } from "@/lib/debts";
import {
  esFrecuencia,
  planDeCuotas,
  totalConInteres,
  type Frecuencia,
} from "@/lib/prestamos";

export type DebtState = { error?: string; ok?: string } | undefined;

const VALID_PAYMENTS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];

function readPayment(value: FormDataEntryValue | null): PaymentMethod {
  const v = String(value ?? "EFECTIVO") as PaymentMethod;
  return VALID_PAYMENTS.includes(v) ? v : "EFECTIVO";
}

function refresh(id?: string) {
  revalidatePath("/panel/cartera");
  if (id) revalidatePath("/panel/cartera/" + id);
  revalidatePath("/panel");
}

/** Anota que alguien quedo debiendo. */
export async function createDebtAction(
  _prev: DebtState,
  formData: FormData
): Promise<DebtState> {
  const user = await requireUser();

  const clientName = str(formData.get("clientName"));
  if (!clientName) return { error: "Escribe quien debe." };

  const concept = str(formData.get("concept"));
  if (!concept) return { error: "Escribe por que debe." };

  /**
   * Un prestamo por cuotas o un fiado suelto.
   *
   * El fiado de una tienda solo tiene un monto. El prestamo tiene capital,
   * interes y cuotas, y de ahi sale el total: no se escribe a mano, para que
   * nunca pueda quedar un total que no cuadre con lo que se presto.
   */
  const esPrestamo = str(formData.get("modo")) === "prestamo";

  let amount = 0;
  let principal: number | null = null;
  let interestPct: number | null = null;
  let installments: number | null = null;
  let frequency: Frecuencia | null = null;

  if (esPrestamo) {
    principal = parseMoney(formData.get("principal"), user.currency);
    if (principal <= 0) return { error: "Escribe cuanto le prestaste." };

    interestPct = Math.max(0, parseIntSafe(formData.get("interestPct"), 0));
    if (interestPct > 500) return { error: "Ese interes no parece real. Revisalo." };

    installments = parseIntSafe(formData.get("installments"), 0);
    if (installments <= 0) return { error: "Escribe en cuantas cuotas te va a pagar." };
    if (installments > 500) return { error: "Son demasiadas cuotas. Maximo 500." };

    const f = str(formData.get("frequency"));
    if (!esFrecuencia(f)) return { error: "Elige cada cuanto te paga." };
    frequency = f;

    amount = totalConInteres(principal, interestPct);
  } else {
    amount = parseMoney(formData.get("amount"), user.currency);
    if (amount <= 0) return { error: "El valor debe ser mayor a cero." };
  }

  const dayInput = str(formData.get("day"));
  const dueInput = str(formData.get("dueDay"));
  const day = isValidDay(dayInput) ? dayInput : todayIn(user.timezone);

  if (dueInput && !isValidDay(dueInput)) return { error: "La fecha de vencimiento no es valida." };
  if (dueInput && dueInput < day) {
    return { error: "El vencimiento no puede ser antes de la fecha de la deuda." };
  }

  // En un prestamo el vencimiento es el dia de la ultima cuota: no hay que
  // pedirlo, sale del plan. Asi la lista de vencidas sigue funcionando igual.
  let dueDay = dueInput || null;
  if (esPrestamo && frequency && installments) {
    const plan = planDeCuotas({ total: amount, cuotas: installments, frecuencia: frequency, desde: day });
    dueDay = plan[plan.length - 1]?.day ?? dueDay;
  }

  await db.debt.create({
    data: {
      userId: user.id,
      clientName,
      clientPhone: str(formData.get("clientPhone")) || null,
      concept,
      amount,
      day,
      dueDay,
      notes: texto(formData.get("notes")) || null,
      // Si la venta ya se registro, cobrar no vuelve a sumar a la caja.
      alreadyInvoiced: formData.get("alreadyInvoiced") === "on",
      principal,
      interestPct,
      installments,
      frequency,
      // El fiador: quien responde si el deudor no paga.
      guarantorName: str(formData.get("guarantorName")) || null,
      guarantorId: str(formData.get("guarantorId")) || null,
      guarantorPhone: str(formData.get("guarantorPhone")) || null,
      guarantorAddress: str(formData.get("guarantorAddress")) || null,
    },
  });

  refresh();
  return { ok: esPrestamo ? "Prestamo anotado." : "Deuda anotada." };
}

/**
 * Registra un abono.
 *
 * Cuando la deuda no estaba facturada, el abono si es venta del dia: la plata
 * entra hoy a la caja y por eso creamos la venta. Si ya estaba facturada, solo
 * se descuenta del saldo, porque esa plata ya se conto cuando se hizo la venta.
 * Las dos cosas van en una sola transaccion.
 */
export async function addPaymentAction(
  _prev: DebtState,
  formData: FormData
): Promise<DebtState> {
  const { user, staff: me } = await requireSession();
  const debtId = str(formData.get("debtId"));

  const debt = await db.debt.findFirst({
    where: { id: debtId, userId: user.id },
    include: { payments: { select: { amount: true } } },
  });
  if (!debt) return { error: "No encontramos esa deuda." };
  if (debt.status === "ANULADA") return { error: "Esa deuda esta anulada." };

  const pendiente = saldo(debt);
  if (pendiente === 0) return { error: "Esa deuda ya esta pagada." };

  const amount = parseMoney(formData.get("amount"), user.currency);
  if (amount <= 0) return { error: "El abono debe ser mayor a cero." };
  if (amount > pendiente) {
    return { error: "El abono es mayor que lo que falta. Faltan " + pendiente + "." };
  }

  const dayInput = str(formData.get("day"));
  const day = isValidDay(dayInput) ? dayInput : todayIn(user.timezone);
  const method = readPayment(formData.get("method"));
  const notes = texto(formData.get("notes")) || null;

  await db.$transaction(async (tx) => {
    let saleId: string | null = null;

    if (!debt.alreadyInvoiced) {
      const sale = await tx.sale.create({
        data: {
          userId: user.id,
          day,
          total: amount,
          staffId: me.id,
          paymentMethod: method,
          origin: "CARTERA",
          clientName: debt.clientName,
          notes: "Abono - " + debt.concept,
          items: {
            create: [{ userId: user.id, name: "Abono - " + debt.concept, unitPrice: amount, qty: 1 }],
          },
        },
      });
      saleId = sale.id;
    }

    await tx.debtPayment.create({
      data: { userId: user.id, debtId: debt.id, amount, day, method, notes, saleId },
    });

    // Si con este abono queda en cero, la deuda se cierra sola.
    if (amount >= pendiente) {
      await tx.debt.update({ where: { id: debt.id }, data: { status: "PAGADA" } });
    }
  });

  refresh(debt.id);
  revalidatePath("/panel/ventas");
  return { ok: amount >= pendiente ? "Deuda pagada por completo." : "Abono registrado." };
}

/** Borra un abono. Si genero una venta, se va con el. */
export async function deletePaymentAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));

  const pago = await db.debtPayment.findFirst({
    where: { id, userId: user.id },
    include: { debt: { select: { id: true } } },
  });
  if (!pago) return;

  await db.$transaction(async (tx) => {
    if (pago.saleId) {
      await tx.sale.deleteMany({ where: { id: pago.saleId, userId: user.id } });
    }
    await tx.debtPayment.delete({ where: { id: pago.id } });
    // Al quitar plata la deuda vuelve a estar pendiente.
    await tx.debt.updateMany({
      where: { id: pago.debtId, userId: user.id, status: "PAGADA" },
      data: { status: "PENDIENTE" },
    });
  });

  refresh(pago.debtId);
  revalidatePath("/panel/ventas");
}

/** Deja anotado que ya se le cobro, para no acosar al cliente. */
export async function markCollectedAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));
  await db.debt.updateMany({
    where: { id, userId: user.id },
    data: { lastReminderAt: new Date() },
  });
  refresh(id);
}

/** Cambiar el vencimiento cuando se acuerda un nuevo plazo. */
export async function updateDueDayAction(
  _prev: DebtState,
  formData: FormData
): Promise<DebtState> {
  const user = await requireUser();
  const id = str(formData.get("id"));
  const dueInput = str(formData.get("dueDay"));

  if (dueInput && !isValidDay(dueInput)) return { error: "La fecha no es valida." };

  const updated = await db.debt.updateMany({
    where: { id, userId: user.id },
    data: { dueDay: dueInput || null },
  });
  if (updated.count === 0) return { error: "No encontramos esa deuda." };

  refresh(id);
  return { ok: dueInput ? "Nuevo plazo guardado." : "Se quito la fecha de vencimiento." };
}

/** Anular: la deuda se da por perdida o estaba mal anotada. */
export async function cancelDebtAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));
  await db.debt.updateMany({
    where: { id, userId: user.id },
    data: { status: "ANULADA" },
  });
  refresh(id);
}

export async function reopenDebtAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));
  await db.debt.updateMany({
    where: { id, userId: user.id, status: "ANULADA" },
    data: { status: "PENDIENTE" },
  });
  refresh(id);
}

/**
 * Borrar del todo. Solo si no tiene abonos: si ya cobro algo, se anula, para
 * que no se pierda el rastro de la plata que si entro.
 */
export async function deleteDebtAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));

  const cuantos = await db.debtPayment.count({ where: { debtId: id, userId: user.id } });
  if (cuantos > 0) {
    await db.debt.updateMany({ where: { id, userId: user.id }, data: { status: "ANULADA" } });
  } else {
    await db.debt.deleteMany({ where: { id, userId: user.id } });
  }

  refresh(id);
}
