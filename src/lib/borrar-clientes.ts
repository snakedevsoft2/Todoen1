import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { whereDeSegmento } from "./clientes";

/**
 * Borrar clientes de a varios: los que se marcaron uno por uno, o todos los
 * que coinciden con la busqueda y la etiqueta que se esta mirando (sin filtro,
 * todos los del negocio).
 *
 * Se borra la ficha con sus notas, etiquetas, seguimientos, oportunidades y
 * mensajes programados. Las ventas, los turnos y las deudas no se borran: son
 * de la caja, y ahi el cliente queda con su nombre escrito.
 *
 * Todo se filtra por el negocio: un id de otro negocio en la lista no borra
 * nada.
 */

export const MAX_IDS = 1000;

export type SeleccionClientes = { ids: string[] } | { todos: true; q?: string; etiqueta?: string };
export type ResultadoBorrar = { ok: true; borrados: number } | { ok: false; error: string };

export async function borrarClientes(userId: string, seleccion: unknown): Promise<ResultadoBorrar> {
  if (!seleccion || typeof seleccion !== "object") return { ok: false, error: "Elige los clientes que vas a borrar." };
  const s = seleccion as Record<string, unknown>;

  let where: Prisma.CustomerWhereInput;
  if (s.todos === true) {
    const q = typeof s.q === "string" ? s.q.slice(0, 100) : "";
    const etiqueta = typeof s.etiqueta === "string" ? s.etiqueta.slice(0, 40) : "";
    where = whereDeSegmento(userId, { q, etiquetas: etiqueta ? [etiqueta] : [] });
  } else {
    const ids = Array.isArray(s.ids)
      ? [...new Set(s.ids.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 40))]
      : [];
    if (ids.length === 0) return { ok: false, error: "Elige al menos un cliente." };
    if (ids.length > MAX_IDS) return { ok: false, error: "Son demasiados de una vez. Usa \"Elegir todos\"." };
    where = { userId, id: { in: ids } };
  }

  const r = await db.customer.deleteMany({ where });
  return { ok: true, borrados: r.count };
}
