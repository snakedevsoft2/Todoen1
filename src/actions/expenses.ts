"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner, requireSession } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { parseMoney, str } from "@/lib/format";
import { anotarActividad } from "@/lib/actividad";

export type ExpenseState = { error?: string; ok?: string } | undefined;

export async function createExpenseAction(
  _prev: ExpenseState,
  formData: FormData
): Promise<ExpenseState> {
  const { user, staff } = await requireSession();
  const description = str(formData.get("description"));
  const amount = parseMoney(formData.get("amount"), user.currency);

  if (!description) return { error: "Escribe en que gastaste." };
  if (amount <= 0) return { error: "El valor debe ser mayor a cero." };

  const dayInput = str(formData.get("day"));
  await db.expense.create({
    data: {
      userId: user.id,
      day: isValidDay(dayInput) ? dayInput : todayIn(user.timezone),
      description,
      amount,
      category: str(formData.get("category"), "General"),
    },
  });
  await anotarActividad({ user, staff }, { tipo: "gasto", detalle: "Anotó un gasto: " + description, monto: amount });

  revalidatePath("/panel/gastos");
  revalidatePath("/panel");
  return { ok: "Gasto registrado." };
}

/** Borrar un gasto es solo del dueño. */
export async function deleteExpenseAction(formData: FormData) {
  const { user, staff } = await requireOwner();
  const id = str(formData.get("id"));
  const gasto = await db.expense.findFirst({ where: { id, userId: user.id }, select: { description: true, amount: true } });
  if (!gasto) return;
  await db.expense.deleteMany({ where: { id, userId: user.id } });
  await anotarActividad({ user, staff }, { tipo: "borrado", detalle: "Borró el gasto: " + gasto.description, monto: gasto.amount });
  revalidatePath("/panel/gastos");
  revalidatePath("/panel");
}
