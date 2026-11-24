/**
 * El cobro de una cita que la manicurista marca como Cerrada (MB Nails, ver
 * lib/mb-nails.ts): el servicio de la cita a su precio, mas lo adicional que
 * le agrego (un decorado, otro servicio, una bebida).
 *
 * La manicurista no cambia precios: el del servicio sale de la cita y el de lo
 * que agrega de la lista sale del catalogo, nunca de lo que mande el
 * telefono. Solo lo "otro" (algo que no esta en la lista, como un decorado
 * especial) lleva el valor que ella escribe, y queda con su nombre en la venta.
 *
 * Sin base de datos: la accion le pasa lo que leyo y guarda lo que esto arma.
 */

export const MAX_ADICIONALES = 15;
export const MAX_CANTIDAD = 20;

export type RenglonCobro = { serviceId: string | null; name: string; unitPrice: number; qty: number };

/** Lo que manda el formulario, en el campo "adicionales" (JSON). */
export type AdicionalPedido =
  | { tipo: "lista"; serviceId: string; qty: number }
  | { tipo: "otro"; nombre: string; valor: string };

export function leerAdicionales(crudo: string): AdicionalPedido[] | null {
  if (!crudo.trim()) return [];
  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (!Array.isArray(datos)) return null;
  const out: AdicionalPedido[] = [];
  for (const d of datos) {
    if (!d || typeof d !== "object") return null;
    const r = d as Record<string, unknown>;
    if (r.tipo === "lista" && typeof r.serviceId === "string") {
      out.push({ tipo: "lista", serviceId: r.serviceId, qty: Number(r.qty) });
    } else if (r.tipo === "otro") {
      out.push({ tipo: "otro", nombre: String(r.nombre ?? ""), valor: String(r.valor ?? "") });
    } else {
      return null;
    }
  }
  return out;
}

export function armarCobro(
  cita: { serviceId: string | null; serviceName: string; price: number },
  adicionales: AdicionalPedido[],
  /** Los productos y servicios activos del negocio, por id. */
  catalogo: Map<string, { name: string; price: number }>,
  /** Lee la plata escrita ("10.000", "10") como la guarda la base. */
  leerPlata: (escrito: string) => number
): { items: RenglonCobro[]; total: number } | { error: string } {
  if (adicionales.length > MAX_ADICIONALES) return { error: "Son demasiados adicionales. Máximo " + MAX_ADICIONALES + "." };

  const items: RenglonCobro[] = [{ serviceId: cita.serviceId, name: cita.serviceName, unitPrice: cita.price, qty: 1 }];
  for (const a of adicionales) {
    if (a.tipo === "lista") {
      const s = catalogo.get(a.serviceId);
      if (!s) return { error: "Uno de los adicionales ya no está en la lista de precios." };
      const qty = Math.trunc(a.qty);
      if (!Number.isFinite(qty) || qty < 1 || qty > MAX_CANTIDAD) return { error: "La cantidad de " + s.name + " no está bien." };
      items.push({ serviceId: a.serviceId, name: s.name, unitPrice: s.price, qty });
    } else {
      const nombre = a.nombre.replace(/\s+/g, " ").trim().slice(0, 80);
      const valor = leerPlata(a.valor);
      if (!nombre) return { error: "Escribe qué fue lo adicional." };
      if (valor <= 0) return { error: "Escribe cuánto vale " + nombre + "." };
      items.push({ serviceId: null, name: nombre, unitPrice: valor, qty: 1 });
    }
  }
  return { items, total: items.reduce((s, i) => s + i.unitPrice * i.qty, 0) };
}

/**
 * Una venta sin cita desde el apartado Mecato de la manicurista: bebidas,
 * mecato o cualquier cosa de la lista. Igual que en la cita, el precio de cada
 * cosa sale del catalogo y del telefono solo se lee que y cuantas.
 */
export const MAX_RENGLONES_VENTA = 30;
export const MAX_CANTIDAD_VENTA = 50;

export type PedidoVenta = { serviceId: string; qty: number };

export function leerPedidoVenta(crudo: string): PedidoVenta[] | null {
  let datos: unknown;
  try {
    datos = JSON.parse(crudo || "[]");
  } catch {
    return null;
  }
  if (!Array.isArray(datos)) return null;
  const out: PedidoVenta[] = [];
  for (const d of datos) {
    if (!d || typeof d !== "object" || typeof (d as { serviceId?: unknown }).serviceId !== "string") return null;
    out.push({ serviceId: (d as { serviceId: string }).serviceId, qty: Number((d as { qty?: unknown }).qty) });
  }
  return out;
}

export function armarVenta(
  pedido: PedidoVenta[],
  catalogo: Map<string, { name: string; price: number }>
): { items: RenglonCobro[]; total: number } | { error: string } {
  if (pedido.length === 0) return { error: "Escoge al menos un producto." };
  if (pedido.length > MAX_RENGLONES_VENTA) return { error: "Son demasiados productos en una sola venta." };
  const porId = new Map<string, number>();
  for (const p of pedido) porId.set(p.serviceId, (porId.get(p.serviceId) ?? 0) + Math.trunc(p.qty));
  const items: RenglonCobro[] = [];
  for (const [serviceId, qty] of porId) {
    const s = catalogo.get(serviceId);
    if (!s) return { error: "Uno de los productos ya no está en la lista de precios." };
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_CANTIDAD_VENTA) return { error: "La cantidad de " + s.name + " no está bien." };
    items.push({ serviceId, name: s.name, unitPrice: s.price, qty });
  }
  return { items, total: items.reduce((s, i) => s + i.unitPrice * i.qty, 0) };
}
