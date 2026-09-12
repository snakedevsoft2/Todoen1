"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { parseMoney, str } from "@/lib/format";

export type ExpenseState = { error?: string; ok?: string } | undefined;

export async function createExpenseAction(
  _prev: ExpenseState,
  formData: FormData
): Promise<ExpenseState> {
  const user = await requireUser();
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

  revalidatePath("/panel/gastos");
  revalidatePath("/panel");
  return { ok: "Gasto registrado." };
}

export async function deleteExpenseAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));
  await db.expense.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/panel/gastos");
  revalidatePath("/panel");
}
