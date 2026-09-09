"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { str } from "@/lib/format";

export type SupplierState = { error?: string; ok?: string } | undefined;

function refresh() {
  revalidatePath("/panel/proveedores");
  revalidatePath("/panel/catalogo");
  revalidatePath("/panel/inventario");
}

/**
 * Crea o edita un proveedor.
 *
 * Solo el dueno: a quien se le compra y a como es informacion del negocio, no
 * del turno de quien esta vendiendo.
 */
export async function saveSupplierAction(
  _prev: SupplierState,
  formData: FormData
): Promise<SupplierState> {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const name = str(formData.get("name"));
  if (!name) return { error: "Escribe el nombre del proveedor." };

  const data = {
    name,
    contact: str(formData.get("contact")) || null,
    phone: str(formData.get("phone")) || null,
    notes: str(formData.get("notes")) || null,
  };

  const repetido = await db.supplier.findFirst({
    where: { userId: user.id, name, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (repetido) return { error: "Ya tienes un proveedor con ese nombre." };

  if (id) {
    const updated = await db.supplier.updateMany({ where: { id, userId: user.id }, data });
    if (updated.count === 0) return { error: "No encontramos ese proveedor." };
    refresh();
    return { ok: "Proveedor actualizado." };
  }

  const cuantos = await db.supplier.count({ where: { userId: user.id } });
  if (cuantos >= 100) return { error: "Por ahora puedes tener hasta 100 proveedores." };

  await db.supplier.create({ data: { ...data, userId: user.id } });
  refresh();
  return { ok: "Proveedor agregado." };
}

export async function toggleSupplierAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const supplier = await db.supplier.findFirst({ where: { id, userId: user.id } });
  if (!supplier) return;
  await db.supplier.update({ where: { id: supplier.id }, data: { active: !supplier.active } });
  refresh();
}

/**
 * Borra el proveedor. Las prendas y las entradas que le apuntaban se quedan:
 * el historial de compras no se pierde, solo deja de tener nombre.
 */
export async function deleteSupplierAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  await db.supplier.deleteMany({ where: { id, userId: user.id } });
  refresh();
}
