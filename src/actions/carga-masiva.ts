"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requireUser } from "@/lib/auth";
import { cargarClientes, cargarProductos, type ResultadoCarga } from "@/lib/carga-masiva";
import { motivoSinPlan } from "@/lib/plan";

export type RespuestaCarga = { ok: true; resultado: ResultadoCarga } | { ok: false; error: string };

export async function cargarClientesAction(filas: unknown): Promise<RespuestaCarga> {
  const { user } = await requireSession();
  const sinPlan = motivoSinPlan(user);
  if (sinPlan) return { ok: false, error: sinPlan };
  if (!Array.isArray(filas) || filas.length === 0) return { ok: false, error: "No hay clientes para cargar." };
  const resultado = await cargarClientes(user.id, filas);
  revalidatePath("/panel/clientes");
  return { ok: true, resultado };
}

export async function cargarProductosAction(filas: unknown): Promise<RespuestaCarga> {
  const user = await requireUser();
  const sinPlan = motivoSinPlan(user);
  if (sinPlan) return { ok: false, error: sinPlan };
  if (!Array.isArray(filas) || filas.length === 0) return { ok: false, error: "No hay productos para cargar." };
  const resultado = await cargarProductos(user, filas);
  revalidatePath("/panel/catalogo");
  revalidatePath("/panel/inventario");
  revalidatePath("/panel/ventas");
  revalidatePath("/catalogo/" + user.slug);
  return { ok: true, resultado };
}
