"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { str } from "@/lib/format";
import {
  asignarProductos,
  borrarCategoria,
  crearCategoria,
  moverCategoria,
  renombrarCategoria,
  type Resultado,
} from "@/lib/categorias-negocio";
import type { ActionState } from "./services";

/**
 * Armar las categorias es del dueño: cambia como se ve el catalogo en todas
 * partes. El empleado sigue pudiendo crear productos con una categoria.
 */

function responder(slug: string, r: Resultado): ActionState {
  if ("error" in r) return { error: r.error };
  revalidatePath("/panel/catalogo");
  revalidatePath("/panel/ventas");
  revalidatePath("/panel/inventario");
  revalidatePath("/catalogo/" + slug);
  return { ok: r.ok };
}

export async function crearCategoriaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireOwner();
  return responder(user.slug, await crearCategoria(user.id, str(formData.get("name"))));
}

export async function renombrarCategoriaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireOwner();
  return responder(user.slug, await renombrarCategoria(user.id, str(formData.get("id")), str(formData.get("name"))));
}

export async function borrarCategoriaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireOwner();
  return responder(user.slug, await borrarCategoria(user.id, str(formData.get("id"))));
}

export async function moverCategoriaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireOwner();
  const direccion = formData.get("direccion") === "abajo" ? "abajo" : "arriba";
  return responder(user.slug, await moverCategoria(user.id, str(formData.get("id")), direccion));
}

export async function asignarProductosAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireOwner();
  const productos = formData.getAll("productos").map((v) => String(v));
  return responder(user.slug, await asignarProductos(user.id, str(formData.get("id")), productos));
}
