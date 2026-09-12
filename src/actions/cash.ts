"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { parseMoney, str } from "@/lib/format";
import { getDaySummary } from "@/lib/queries";

export type CashState = { error?: string; ok?: string } | undefined;

/**
 * Cierre de caja del dia: congela los totales de ventas, gastos y metodos de
 * pago, y guarda la diferencia frente al efectivo contado a mano.
 */
export async function closeCashAction(_prev: CashState, formData: FormData): Promise<CashState> {
  const user = await requireUser();
  const dayInput = str(formData.get("day"));
  const day = isValidDay(dayInput) ? dayInput : todayIn(user.timezone);

  const summary = await getDaySummary(user.id, day);
  if (summary.salesCount === 0 && summary.totalExpenses === 0) {
    return { error: "No hay movimientos en ese dia para cerrar." };
  }

  const openingAmount = parseMoney(formData.get("openingAmount"), user.currency);
  const countedCash = parseMoney(formData.get("countedCash"), user.currency);
  const expectedCash = openingAmount + summary.byMethod.EFECTIVO - summary.totalExpenses;

  const data = {
    openingAmount,
    totalSales: summary.totalSales,
    totalCash: summary.byMethod.EFECTIVO,
    totalCard: summary.byMethod.TARJETA,
    totalTransfer: summary.byMethod.TRANSFERENCIA,
    totalOther: summary.byMethod.OTRO,
    totalExpenses: summary.totalExpenses,
    netTotal: summary.netTotal,
    salesCount: summary.salesCount,
    countedCash,
    difference: countedCash > 0 ? countedCash - expectedCash : 0,
    notes: str(formData.get("notes")) || null,
    closedAt: new Date(),
  };

  await db.cashClosure.upsert({
    where: { userId_day: { userId: user.id, day } },
    create: { userId: user.id, day, ...data },
    update: data,
  });

  revalidatePath("/panel/caja");
  revalidatePath("/panel");
  return { ok: "Caja cerrada para el " + day + "." };
}

export async function reopenCashAction(formData: FormData) {
  const user = await requireUser();
  const day = str(formData.get("day"));
  await db.cashClosure.deleteMany({ where: { userId: user.id, day } });
  revalidatePath("/panel/caja");
  revalidatePath("/panel");
}
