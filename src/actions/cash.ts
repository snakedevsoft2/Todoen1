"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner, requireSession } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { parseMoney, str } from "@/lib/format";
import { getDaySummary } from "@/lib/queries";
import { anotarActividad } from "@/lib/actividad";
import { esDueno } from "@/lib/permisos-empleado";

export type CashState = { error?: string; ok?: string } | undefined;

/**
 * Cierre de caja del dia: congela los totales de ventas, gastos y metodos de
 * pago, y guarda la diferencia frente al efectivo contado a mano.
 *
 * Cada quien cierra la suya: el dueño ve y cierra el negocio completo (como
 * siempre), y cada empleado con cuenta separada cierra solo sus propias
 * ventas, sin pisarle el cierre a nadie mas ni ver lo que vendieron los
 * demas. Ver getDaySummary().
 */
export async function closeCashAction(_prev: CashState, formData: FormData): Promise<CashState> {
  const { user, staff } = await requireSession();
  const dayInput = str(formData.get("day"));
  const day = isValidDay(dayInput) ? dayInput : todayIn(user.timezone);
  const propio = esDueno(staff.role) ? undefined : staff.id;

  const summary = await getDaySummary(user.id, day, propio);
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
    where: { userId_staffId_day: { userId: user.id, staffId: staff.id, day } },
    create: { userId: user.id, staffId: staff.id, day, ...data },
    update: data,
  });
  await anotarActividad({ user, staff }, { tipo: "caja", detalle: "Cerró la caja del " + day, monto: summary.netTotal });

  revalidatePath("/panel/caja");
  revalidatePath("/panel");
  return { ok: "Caja cerrada para el " + day + "." };
}

/**
 * Reabrir la caja deshace un cierre: solo el dueño, y el de cualquiera de su
 * equipo (cada quien tiene el suyo ahora). Sin `staffId` en el formulario,
 * reabre el propio del dueño, que es el boton de siempre.
 */
export async function reopenCashAction(formData: FormData) {
  const { user, staff } = await requireOwner();
  const day = str(formData.get("day"));
  const staffId = str(formData.get("staffId")) || staff.id;
  const r = await db.cashClosure.deleteMany({ where: { userId: user.id, staffId, day } });
  if (r.count > 0) await anotarActividad({ user, staff }, { tipo: "cambio", detalle: "Reabrió la caja del " + day });
  revalidatePath("/panel/caja");
  revalidatePath("/panel");
}
