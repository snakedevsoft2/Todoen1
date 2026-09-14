"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, requireSession } from "@/lib/auth";
import {
  actualizarFactura,
  emitirFactura,
  guardarConfiguracion,
  probarConexion,
  type ConfigVista,
  type FacturaVista,
} from "@/lib/facturacion";
import type { RangoFactus } from "@/lib/facturacion/factus";

export type FacturacionState = { error?: string; ok?: string; config?: ConfigVista } | undefined;

/** Solo el dueño configura: con estas credenciales se factura a nombre del negocio. */
export async function guardarFacturacionAction(_prev: FacturacionState, formData: FormData): Promise<FacturacionState> {
  const { user } = await requireOwner();
  const datos: Record<string, unknown> = {};
  for (const [clave, valor] of formData.entries()) if (typeof valor === "string") datos[clave] = valor;
  const r = await guardarConfiguracion(user.id, datos);
  if (!r.ok) return { error: r.error };
  revalidatePath("/panel/ajustes");
  revalidatePath("/panel/ventas");
  return {
    ok: r.datos.enabled ? "Guardado. La factura autorizada quedó activa." : "Guardado. La factura autorizada está apagada.",
    config: r.datos,
  };
}

export type PruebaState = { ok: boolean; mensaje: string; rangos?: RangoFactus[] } | undefined;

export async function probarFacturacionAction(_prev: PruebaState): Promise<PruebaState> {
  const { user } = await requireOwner();
  const r = await probarConexion(user.id);
  revalidatePath("/panel/ajustes");
  return r;
}

export type EmisionRespuesta = { ok: true; factura: FacturaVista } | { ok: false; error: string };

/** Cualquiera del equipo que vende puede pedir la factura autorizada de una venta. */
export async function emitirFacturaAction(saleId: string, comprador: unknown): Promise<EmisionRespuesta> {
  const sesion = await requireSession();
  const r = await emitirFactura(sesion, String(saleId), comprador);
  revalidatePath("/panel/ventas");
  return r.ok ? { ok: true, factura: r.datos } : { ok: false, error: r.error };
}

export async function actualizarFacturaAction(id: string): Promise<EmisionRespuesta> {
  const sesion = await requireSession();
  const r = await actualizarFactura(sesion, String(id));
  revalidatePath("/panel/ventas");
  return r.ok ? { ok: true, factura: r.datos } : { ok: false, error: r.error };
}
