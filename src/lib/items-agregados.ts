import { db } from "./db";
import { parseMoney } from "./format";

/** Lo que pide el telefono: un producto del inventario, o uno escrito a mano. */
export type ItemPedido = { serviceId?: string | null; name?: string; precio?: string; qty: number };

export type ItemListo = { serviceId: string | null; name: string; unitPrice: number; qty: number };

/**
 * Lo que se le agrega a una venta o a un fiado que ya estaba registrado.
 *
 * El precio de un producto del inventario se pone aqui, del catalogo, y no el
 * que mande el telefono. Los productos con tallas no entran: esos descuentan
 * stock y se venden escogiendo la talla.
 */
export async function itemsParaAgregar(
  userId: string,
  currency: string,
  ceros: number,
  pedidos: unknown
): Promise<{ items: ItemListo[] } | { error: string }> {
  if (!Array.isArray(pedidos) || pedidos.length === 0) return { error: "Escoge al menos un producto." };
  if (pedidos.length > 100) return { error: "Son demasiados productos de una vez." };

  const lista = pedidos as Partial<ItemPedido>[];
  const ids = lista.flatMap((p) => (typeof p?.serviceId === "string" && p.serviceId ? [p.serviceId] : []));
  const catalogo = ids.length
    ? await db.service.findMany({
        where: { userId, id: { in: ids } },
        select: { id: true, name: true, price: true, trackStock: true },
      })
    : [];
  const porId = new Map(catalogo.map((s) => [s.id, s]));

  const items: ItemListo[] = [];
  for (const p of lista) {
    const qty = Math.floor(Number(p?.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 9999) return { error: "Revisa las cantidades." };
    if (typeof p?.serviceId === "string" && p.serviceId) {
      const s = porId.get(p.serviceId);
      if (!s) return { error: "Uno de los productos ya no existe. Recarga la página." };
      if (s.trackStock) return { error: s.name + " se vende por talla: regístralo como una venta nueva." };
      items.push({ serviceId: s.id, name: s.name, unitPrice: s.price, qty });
    } else {
      const name = String(p?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      const unitPrice = parseMoney(String(p?.precio ?? ""), currency, ceros);
      if (!name) return { error: "Escribe qué se agregó." };
      if (unitPrice <= 0) return { error: "El precio de " + name + " debe ser mayor a cero." };
      items.push({ serviceId: null, name, unitPrice, qty });
    }
  }
  return { items };
}

/** "2x Papa natural grande, 1x Mixto", como se escriben en el fiado. */
export function resumenDeItems(items: ItemListo[]): string {
  return items.map((i) => i.qty + "x " + i.name).join(", ");
}
