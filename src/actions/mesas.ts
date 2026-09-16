"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner, requireSession } from "@/lib/auth";
import { configurarMesas, marcarPedidoVisto, ordenDeMesa, pedirEnMesa, type ItemPedido } from "@/lib/mesas";
import { parseIntSafe } from "@/lib/format";
import { anotarActividad } from "@/lib/actividad";

export type MesasState = { error?: string; ok?: string } | undefined;

/** Cuántas mesas tiene el negocio. Solo el dueño. */
export async function configurarMesasAction(_prev: MesasState, formData: FormData): Promise<MesasState> {
  const { user } = await requireOwner();
  const cantidad = parseIntSafe(formData.get("cantidad"), -1);
  const r = await configurarMesas(user.id, cantidad);
  if ("error" in r) return { error: r.error };
  revalidatePath("/panel/cuentas");
  return { ok: r.ok };
}

function leerItems(crudo: unknown): ItemPedido[] {
  if (!Array.isArray(crudo)) return [];
  return crudo
    .map((i) => (i && typeof i === "object" ? (i as Record<string, unknown>) : {}))
    .map((i) => ({ serviceId: String(i.serviceId ?? "").trim(), qty: Number(i.qty ?? 1) }))
    .filter((i) => i.serviceId);
}

/**
 * El cliente pide desde el QR de su mesa. Publica a proposito: es la pagina
 * que abre al escanear, sin haber entrado a nada.
 */
export async function pedirEnMesaAction(
  qrToken: string,
  itemsCrudo: unknown,
  notaCruda: unknown
): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  const items = leerItems(itemsCrudo);
  const nota = String(notaCruda ?? "").trim().slice(0, 200);
  const token = String(qrToken ?? "").trim().slice(0, 60);
  const r = await pedirEnMesa(token, items, nota || null);
  if ("error" in r) return { ok: false, error: r.error };
  return { ok: true, orderId: r.orderId! };
}

/** Toca una mesa en el piso: entra a su cuenta abierta, o le abre una nueva. */
export async function abrirMesaAction(formData: FormData): Promise<void> {
  const { user, staff } = await requireSession();
  const tableId = String(formData.get("tableId") ?? "").trim();
  const r = await ordenDeMesa(user.id, tableId);
  if ("error" in r) redirect("/panel/cuentas");
  if (r.creada) {
    await anotarActividad({ user, staff }, { tipo: "cuenta", detalle: "Abrió la cuenta " + r.label });
    revalidatePath("/panel/cuentas");
    revalidatePath("/panel");
  }
  redirect("/panel/cuentas/" + r.orderId);
}

/** Al abrir la cuenta en el panel, se apaga el aviso de "pedido nuevo". */
export async function marcarPedidoVistoAction(orderId: string): Promise<void> {
  const { user } = await requireSession();
  await marcarPedidoVisto(user.id, String(orderId ?? "").trim().slice(0, 60));
}
