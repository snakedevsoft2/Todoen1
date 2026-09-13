import { llaveNombre } from "./crm";

/**
 * Las reglas del agente que no necesitan base de datos ni modelo.
 */

/** Lo mas largo que se acepta de un cliente. Un mensaje real no pasa de esto. */
export const MAX_LARGO_MENSAJE = 600;

/**
 * Topes de uso.
 *
 * Cada respuesta del agente cuesta una consulta al modelo. Sin tope, alguien
 * con un programa podria gastarse en una tarde la cuota de todo el mes de un
 * negocio escribiendole al chat publico.
 */
export const MAX_POR_CONVERSACION_DIA = 40;
export const MAX_POR_NEGOCIO_DIA = 800;
/** Rafaga en el chat publico: mensajes de todo el negocio en diez minutos. */
export const MAX_WEB_DIEZ_MINUTOS = 120;

/** Cuantos mensajes anteriores se le mandan al modelo. */
export const MENSAJES_DE_CONTEXTO = 20;

/** La llave que el navegador inventa para su conversacion. */
export function esLlaveWeb(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(v);
}

export function limpiarMensaje(v: unknown): string {
  return String(v ?? "")
    .replace(/[^\P{Cc}\n\t]/gu, "")
    .trim()
    .slice(0, MAX_LARGO_MENSAJE);
}

export type ProductoCatalogo = { id: string; name: string; price: number };
export type LineaPedido = { serviceId: string; name: string; unitPrice: number; qty: number };

/**
 * Convierte lo que pidio el cliente en productos del catalogo.
 *
 * El modelo escribe los nombres como los dijo el cliente ("2 hamburguesas
 * sencillas"), no como estan guardados. Primero se busca el nombre exacto; si
 * no, uno que contenga al otro. Si hay mas de uno posible no se adivina: se
 * devuelve como dudoso para que el agente pregunte cual.
 */
export function emparejarProductos(
  pedidos: { nombre: unknown; cantidad: unknown }[],
  catalogo: ProductoCatalogo[]
): { lineas: LineaPedido[]; faltan: string[]; dudosos: { pedido: string; opciones: string[] }[] } {
  const conLlave = catalogo.map((p) => ({ ...p, llave: llaveNombre(p.name) }));
  const porId = new Map<string, LineaPedido>();
  const faltan: string[] = [];
  const dudosos: { pedido: string; opciones: string[] }[] = [];

  for (const p of pedidos.slice(0, 30)) {
    const pedido = String(p?.nombre ?? "").trim().slice(0, 120);
    const llave = llaveNombre(pedido);
    if (!llave) continue;

    const cantidadIn = Math.round(Number(p?.cantidad));
    const qty = Number.isFinite(cantidadIn) ? Math.min(99, Math.max(1, cantidadIn)) : 1;

    let elegido = conLlave.find((c) => c.llave === llave);
    if (!elegido) {
      const parecidos = conLlave.filter((c) => c.llave.includes(llave) || llave.includes(c.llave));
      if (parecidos.length === 1) {
        elegido = parecidos[0];
      } else if (parecidos.length > 1) {
        dudosos.push({ pedido, opciones: parecidos.slice(0, 5).map((c) => c.name) });
        continue;
      }
    }

    if (!elegido) {
      faltan.push(pedido);
      continue;
    }

    const previa = porId.get(elegido.id);
    if (previa) previa.qty = Math.min(99, previa.qty + qty);
    else porId.set(elegido.id, { serviceId: elegido.id, name: elegido.name, unitPrice: elegido.price, qty });
  }

  return { lineas: [...porId.values()], faltan, dudosos };
}

export function totalPedido(lineas: LineaPedido[]): number {
  return lineas.reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

/**
 * Lleva una hora a "HH:mm".
 *
 * Se le pide al modelo en 24 horas, pero a veces devuelve "3:00 p.m." porque
 * asi la dijo el cliente. Mejor entenderla que rechazar el turno.
 */
export function normalizarHora(v: unknown): string | null {
  const m = String(v ?? "")
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  const sufijo = m[3]?.startsWith("p") ? "pm" : m[3]?.startsWith("a") ? "am" : null;
  if (sufijo && (h < 1 || h > 12)) return null;
  if (sufijo === "pm" && h !== 12) h += 12;
  if (sufijo === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
}

/** Texto corto del pedido: "2 × Hamburguesa, 1 × Papas". */
export function resumenPedido(lineas: LineaPedido[]): string {
  return lineas.map((l) => l.qty + " × " + l.name).join(", ");
}
