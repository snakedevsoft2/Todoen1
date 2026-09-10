"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { parseIntSafe, str } from "@/lib/format";
import { MAX_PERCENT, MAX_QTY, MAX_TIERS, MIN_PERCENT, MIN_QTY } from "@/lib/wholesale";

export type WholesaleState = { error?: string; ok?: string } | undefined;

function refresh(slug: string) {
  revalidatePath("/panel/portafolio");
  revalidatePath("/catalogo/" + slug);
}

/**
 * Enciende el apartado de mayoristas y guarda sus condiciones.
 *
 * Solo el dueno: a como se vende en cantidad es una decision del negocio, no
 * de quien esta atendiendo.
 */
export async function updateWholesaleAction(
  _prev: WholesaleState,
  formData: FormData
): Promise<WholesaleState> {
  const { user } = await requireOwner();

  await db.user.update({
    where: { id: user.id },
    data: {
      wholesaleOpen: formData.get("wholesaleOpen") === "on",
      wholesaleTitle: str(formData.get("wholesaleTitle")).slice(0, 60) || null,
      wholesaleNote: str(formData.get("wholesaleNote")).slice(0, 300) || null,
    },
  });

  refresh(user.slug);
  return { ok: "Promociones al por mayor actualizadas." };
}

/**
 * Agrega o edita una escala.
 *
 * Dos escalas con la misma cantidad no pueden existir: si hubiera un "desde 6
 * con 10%" y un "desde 6 con 20%", el pedido no sabria cual cobrar.
 */
export async function saveTierAction(
  _prev: WholesaleState,
  formData: FormData
): Promise<WholesaleState> {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const minQty = parseIntSafe(formData.get("minQty"));
  const percentOff = parseIntSafe(formData.get("percentOff"));
  const label = str(formData.get("label")).slice(0, 40) || null;

  if (minQty < MIN_QTY || minQty > MAX_QTY) {
    return { error: "La cantidad debe ir de " + MIN_QTY + " a " + MAX_QTY + " unidades." };
  }
  if (percentOff < MIN_PERCENT || percentOff > MAX_PERCENT) {
    return { error: "El descuento debe ir de " + MIN_PERCENT + "% a " + MAX_PERCENT + "%." };
  }

  const repetida = await db.wholesaleTier.findFirst({
    where: { userId: user.id, minQty, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (repetida) return { error: "Ya tienes una escala desde " + minQty + " unidades." };

  if (id) {
    const updated = await db.wholesaleTier.updateMany({
      where: { id, userId: user.id },
      data: { minQty, percentOff, label },
    });
    if (updated.count === 0) return { error: "No encontramos esa escala." };
    refresh(user.slug);
    return { ok: "Escala actualizada." };
  }

  const cuantas = await db.wholesaleTier.count({ where: { userId: user.id } });
  if (cuantas >= MAX_TIERS) {
    return { error: "Puedes tener hasta " + MAX_TIERS + " escalas. Borra una para agregar otra." };
  }

  await db.wholesaleTier.create({ data: { userId: user.id, minQty, percentOff, label } });
  refresh(user.slug);
  return { ok: "Escala agregada." };
}

export async function deleteTierAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  await db.wholesaleTier.deleteMany({ where: { id, userId: user.id } });
  refresh(user.slug);
}
