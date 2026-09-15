"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner, requireSession } from "@/lib/auth";
import { crudo, parseIntSafe, parseMoney, str, texto } from "@/lib/format";
import { anotarActividad } from "@/lib/actividad";
import { SOLO_DUENO, esDueno } from "@/lib/permisos-empleado";
import { asegurarCategorias } from "@/lib/categorias-negocio";

export type ActionState = { error?: string; ok?: string } | undefined;

const MAX_PHOTO_BYTES = 400 * 1024;
const ALLOWED_PHOTO = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Crear un producto lo puede hacer el empleado; cambiar uno que ya existe, solo el dueño. */
export async function saveServiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, staff } = await requireSession();
  const id = str(formData.get("id"));
  if (id && !esDueno(staff.role)) return { error: SOLO_DUENO };
  const name = str(formData.get("name"));
  if (!name) return { error: "El nombre es obligatorio." };

  const price = parseMoney(formData.get("price"), user.currency);
  if (price < 0) return { error: "El precio no puede ser negativo." };

  // La foto solo viaja cuando el formulario la trae (tienda de ropa).
  const photoInput = crudo(formData.get("image"));
  let image: string | null | undefined;
  if (photoInput === "__borrar__") {
    image = null;
  } else if (photoInput) {
    if (!ALLOWED_PHOTO.test(photoInput)) {
      return { error: "La foto debe ser una imagen PNG, JPG o WEBP." };
    }
    if (photoInput.length > MAX_PHOTO_BYTES * 1.4) {
      return { error: "La foto pesa demasiado. Sube una imagen mas liviana." };
    }
    image = photoInput;
  }

  // El proveedor solo viaja desde el formulario de la tienda de ropa, y se
  // comprueba que sea de este negocio antes de guardarlo.
  let supplierId: string | null | undefined;
  if (formData.has("supplierId")) {
    const pedido = str(formData.get("supplierId"));
    if (!pedido) {
      supplierId = null;
    } else {
      const supplier = await db.supplier.findFirst({
        where: { id: pedido, userId: user.id },
        select: { id: true },
      });
      supplierId = supplier?.id ?? null;
    }
  }

  // La categoria queda creada si es nueva, y con el nombre ya guardado si solo
  // cambian mayusculas o tildes ("bebidas" entra a "Bebidas").
  const categoriaPedida = str(formData.get("category"), "General");
  const category = (await asegurarCategorias(user.id, [categoriaPedida])).get(categoriaPedida) ?? "General";

  const data = {
    name,
    description: texto(formData.get("description"), 500) || null,
    price,
    cost: parseMoney(formData.get("cost"), user.currency),
    durationMin: Math.max(5, parseIntSafe(formData.get("durationMin"), 30)),
    category,
    bookable: formData.get("bookable") === "on",
    active: formData.get("active") !== null ? formData.get("active") === "on" : true,
    ...(formData.has("brand") ? { brand: str(formData.get("brand")) || null } : {}),
    ...(formData.has("trackStock") ? { trackStock: formData.get("trackStock") === "on" } : {}),
    ...(formData.has("showcase") ? { showcase: formData.get("showcase") === "on" } : {}),
    ...(image !== undefined ? { image } : {}),
    ...(supplierId !== undefined ? { supplierId } : {}),
  };

  if (id) {
    // El where incluye userId: nadie puede editar el catalogo de otro negocio.
    const updated = await db.service.updateMany({ where: { id, userId: user.id }, data });
    if (updated.count === 0) return { error: "No encontramos ese item en tu catalogo." };
    await anotarActividad({ user, staff }, { tipo: "cambio", detalle: "Cambió el producto " + name, monto: price });
  } else {
    await db.service.create({ data: { ...data, userId: user.id } });
    await anotarActividad({ user, staff }, { tipo: "producto", detalle: "Agregó el producto " + name, monto: price });
  }

  revalidatePath("/panel/catalogo");
  revalidatePath("/panel/inventario");
  revalidatePath("/catalogo/" + user.slug);
  revalidatePath("/panel");
  revalidatePath("/panel/ventas");
  return { ok: id ? "Item actualizado." : "Item agregado." };
}

/** Pausar o activar un producto es solo del dueño. */
export async function toggleServiceAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const service = await db.service.findFirst({ where: { id, userId: user.id } });
  if (!service) return;
  await db.service.update({ where: { id: service.id }, data: { active: !service.active } });
  revalidatePath("/panel/catalogo");
  revalidatePath("/panel/inventario");
  revalidatePath("/catalogo/" + user.slug);
}

/** Borrar un producto es solo del dueño. */
export async function deleteServiceAction(formData: FormData) {
  const { user, staff } = await requireOwner();
  const id = str(formData.get("id"));
  const service = await db.service.findFirst({ where: { id, userId: user.id }, select: { name: true } });
  if (!service) return;
  await db.service.deleteMany({ where: { id, userId: user.id } });
  await anotarActividad({ user, staff }, { tipo: "borrado", detalle: "Borró el producto " + service.name });
  revalidatePath("/panel/catalogo");
  revalidatePath("/panel/inventario");
  revalidatePath("/catalogo/" + user.slug);
}
