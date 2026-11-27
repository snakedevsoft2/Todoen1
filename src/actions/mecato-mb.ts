"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { str } from "@/lib/format";
import { applyStockMove } from "@/lib/inventory";
import { anotarActividad } from "@/lib/actividad";
import { esMbNails } from "@/lib/mb-nails";
import { planDeConteo, type ModoConteo } from "@/lib/mecato-mb";
import { productosDeMecato } from "@/lib/mecato-mb-datos";

export type ConteoState = { error?: string; ok?: string } | undefined;

/**
 * Cargar o contar el mecato de MB Nails de una vez (ver lib/mecato-mb.ts):
 * "Llegó mercancía" suma, "Contar lo que hay" reemplaza. Lo que nunca se habia
 * contado empieza a llevar inventario aqui, y desde ahi cada venta lo
 * descuenta sola.
 *
 * Solo la dueña, y solo en su cuenta: los productos salen de la sesion, no
 * del formulario, asi que un campo con el id de otro negocio no hace nada.
 */
export async function contarMecatoAction(_prev: ConteoState, formData: FormData): Promise<ConteoState> {
  const { user, staff } = await requireOwner();
  if (!esMbNails(user.businessName)) return { error: "Esto es solo para MB Nails Spa." };

  const modo: ModoConteo = str(formData.get("modo")) === "conteo" ? "conteo" : "entrada";
  const filas = await productosDeMecato(user.id);
  const plan = planDeConteo(modo, filas, (clave) => {
    const v = formData.get(clave);
    return typeof v === "string" ? v : null;
  });
  if (!plan.ok) return { error: plan.error };
  if (plan.movimientos.length === 0) {
    return {
      error:
        modo === "entrada"
          ? "Escribe cuántas llegaron de al menos un producto."
          : "No cambió nada: lo que contaste es igual a lo que ya había.",
    };
  }

  const day = todayIn(user.timezone);
  try {
    await db.$transaction(
      async (tx) => {
        for (const m of plan.movimientos) {
          let variantId = m.variantId;
          if (m.inicial) {
            await tx.service.updateMany({ where: { id: m.serviceId, userId: user.id }, data: { trackStock: true } });
            if (variantId) {
              await tx.productVariant.updateMany({ where: { id: variantId, userId: user.id }, data: { active: true } });
            } else {
              // Una sola presentacion ("Unica"): una Coca Cola no tiene tallas.
              const nueva = await tx.productVariant.create({ data: { userId: user.id, serviceId: m.serviceId } });
              variantId = nueva.id;
            }
          }
          if (m.delta === 0 || !variantId) continue;
          const r = await applyStockMove(tx, {
            userId: user.id,
            variantId,
            type: m.tipo,
            delta: m.delta,
            day,
            reason: m.inicial ? "Primer conteo" : modo === "entrada" ? "Llegó mercancía" : "Conteo",
            // El conteo manda: si conto menos, baja aunque quede en cero.
            blockNegative: false,
          });
          if (!r.ok) throw new Error(r.error);
        }
      },
      { timeout: 20000 }
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar. Intenta otra vez." };
  }

  const lista = plan.movimientos
    .slice(0, 8)
    .map((m) => (modo === "entrada" && !m.inicial ? "+" + m.delta + " " : "") + m.name + (modo === "entrada" && !m.inicial ? "" : ": " + m.queda))
    .join(", ");
  const resto = plan.movimientos.length > 8 ? " y " + (plan.movimientos.length - 8) + " más" : "";
  await anotarActividad(
    { user, staff },
    { tipo: "inventario", detalle: (modo === "entrada" ? "Cargó mecato: " : "Contó el mecato: ") + lista + resto }
  );

  revalidatePath("/panel/inventario");
  revalidatePath("/panel/ventas");
  revalidatePath("/panel/catalogo");
  revalidatePath("/panel");

  const n = plan.movimientos.length;
  const productos = n === 1 ? "1 producto" : n + " productos";
  if (modo === "entrada") {
    const unidades = plan.movimientos.reduce((s, m) => s + (m.inicial ? m.queda : m.delta), 0);
    return { ok: "Listo: " + unidades + (unidades === 1 ? " unidad" : " unidades") + " en " + productos + "." };
  }
  return { ok: "Listo: quedó contado " + productos + "." };
}
