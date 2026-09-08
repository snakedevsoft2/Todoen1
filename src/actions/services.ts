"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseIntSafe, parseMoney, str } from "@/lib/format";

export type ActionState = { error?: string; ok?: string } | undefined;

export async function saveServiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(formData.get("id"));
  const name = str(formData.get("name"));
  if (!name) return { error: "El nombre es obligatorio." };

  const price = parseMoney(formData.get("price"));
  if (price < 0) return { error: "El precio no puede ser negativo." };

  const data = {
    name,
    description: str(formData.get("description")) || null,
    price,
    cost: parseMoney(formData.get("cost")),
    durationMin: Math.max(5, parseIntSafe(formData.get("durationMin"), 30)),
    category: str(formData.get("category"), "General"),
    bookable: formData.get("bookable") === "on",
    active: formData.get("active") !== null ? formData.get("active") === "on" : true,
  };

  if (id) {
    // El where incluye userId: nadie puede editar el catalogo de otro negocio.
    const updated = await db.service.updateMany({ where: { id, userId: user.id }, data });
    if (updated.count === 0) return { error: "No encontramos ese item en tu catalogo." };
  } else {
    await db.service.create({ data: { ...data, userId: user.id } });
  }

  revalidatePath("/panel/catalogo");
  revalidatePath("/panel");
  return { ok: id ? "Item actualizado." : "Item agregado." };
}

export async function toggleServiceAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));
  const service = await db.service.findFirst({ where: { id, userId: user.id } });
  if (!service) return;
  await db.service.update({ where: { id: service.id }, data: { active: !service.active } });
  revalidatePath("/panel/catalogo");
}

export async function deleteServiceAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData.get("id"));
  await db.service.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/panel/catalogo");
}
