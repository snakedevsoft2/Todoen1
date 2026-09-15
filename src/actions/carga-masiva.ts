"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requireUser } from "@/lib/auth";
import {
  analizarClientes,
  analizarProductos,
  cargarClientes,
  cargarProductos,
  type Analisis,
  type ModoCarga,
  type ResultadoCarga,
} from "@/lib/carga-masiva";
import { motivoSinPlan } from "@/lib/plan";

export type RespuestaCarga = { ok: true; resultado: ResultadoCarga } | { ok: false; error: string };
export type RespuestaAnalisis = { ok: true; analisis: Analisis } | { ok: false; error: string };

const modoDe = (m: unknown, porDefecto: ModoCarga): ModoCarga => (m === "completar" || m === "sobrescribir" ? m : porDefecto);

/** Revisa la lista contra los clientes que ya hay, sin guardar nada. */
export async function analizarClientesAction(filas: unknown): Promise<RespuestaAnalisis> {
  const { user } = await requireSession();
  const sinPlan = motivoSinPlan(user);
  if (sinPlan) return { ok: false, error: sinPlan };
  if (!Array.isArray(filas) || filas.length === 0) return { ok: false, error: "No hay clientes para cargar." };
  return { ok: true, analisis: await analizarClientes(user.id, filas) };
}

export async function cargarClientesAction(filas: unknown, modo?: unknown): Promise<RespuestaCarga> {
  const { user } = await requireSession();
  const sinPlan = motivoSinPlan(user);
  if (sinPlan) return { ok: false, error: sinPlan };
  if (!Array.isArray(filas) || filas.length === 0) return { ok: false, error: "No hay clientes para cargar." };
  const resultado = await cargarClientes(user.id, filas, modoDe(modo, "completar"));
  revalidatePath("/panel/clientes");
  return { ok: true, resultado };
}

/** Revisa la lista contra los productos que ya hay, sin guardar nada. */
export async function analizarProductosAction(filas: unknown): Promise<RespuestaAnalisis> {
  const user = await requireUser();
  const sinPlan = motivoSinPlan(user);
  if (sinPlan) return { ok: false, error: sinPlan };
  if (!Array.isArray(filas) || filas.length === 0) return { ok: false, error: "No hay productos para cargar." };
  return { ok: true, analisis: await analizarProductos(user, filas) };
}

export async function cargarProductosAction(filas: unknown, modo?: unknown): Promise<RespuestaCarga> {
  const user = await requireUser();
  const sinPlan = motivoSinPlan(user);
  if (sinPlan) return { ok: false, error: sinPlan };
  if (!Array.isArray(filas) || filas.length === 0) return { ok: false, error: "No hay productos para cargar." };
  const resultado = await cargarProductos(user, filas, modoDe(modo, "sobrescribir"));
  revalidatePath("/panel/catalogo");
  revalidatePath("/panel/inventario");
  revalidatePath("/panel/ventas");
  revalidatePath("/catalogo/" + user.slug);
  return { ok: true, resultado };
}
