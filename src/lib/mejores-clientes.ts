import { normalizar } from "./orden-productos";

/**
 * Cuanto compra cada cliente, para saber a quien darle promociones (lo pidio
 * Chopo Snacks).
 *
 * Una compra es una venta con nombre de cliente o un fiado. Lo que NO cuenta:
 *   - los abonos de un fiado (ventas de origen CARTERA): el fiado ya se conto
 *     entero el dia que se llevo la mercancia; sumar tambien cada abono seria
 *     contar dos veces la misma compra;
 *   - los fiados que ya se habian registrado en Ventas (alreadyInvoiced), por
 *     la misma razon;
 *   - las ventas de mostrador, que no son de nadie.
 * Eso lo filtra la consulta; aqui llegan ya solo las compras.
 *
 * Los clientes se juntan por el nombre sin tildes ni mayusculas: "Rosa
 * Vizcaíno" y "ROSA VIZCAINO" son la misma persona.
 */
export type VentaCliente = {
  clientName: string;
  total: number;
  day: string;
  items: { name: string; qty: number }[];
};

export type FiadoCliente = { clientName: string; amount: number; day: string; concept: string };

export type ClienteQueCompra = {
  nombre: string;
  compras: number;
  total: number;
  contado: number;
  fiado: number;
  ultima: string;
  /** De lo que mas se lleva a lo que menos. */
  productos: { name: string; qty: number }[];
};

/** Nombres que no son de un cliente de verdad. */
const SIN_CLIENTE = new Set(["", "mostrador", "consumidor final", "cliente", "varios"]);

/**
 * "3x Papa natural mediana, 2x Mixto" (como se anota un fiado hecho desde
 * Ventas) en renglones. Lo que no tiene esa forma no se cuenta como producto.
 */
export function renglonesDeConcepto(concepto: string): { name: string; qty: number }[] {
  return concepto.split(",").flatMap((parte) => {
    const m = parte.trim().match(/^(\d+)\s*x\s+(.+)$/i);
    return m ? [{ name: m[2].trim(), qty: Number(m[1]) }] : [];
  });
}

export function clientesQueCompran(ventas: VentaCliente[], fiados: FiadoCliente[]): ClienteQueCompra[] {
  type Fila = Omit<ClienteQueCompra, "productos"> & { productos: Map<string, { name: string; qty: number }> };
  const porCliente = new Map<string, Fila>();

  const sumar = (nombre: string, day: string, valor: number, aCredito: boolean, items: { name: string; qty: number }[]) => {
    const clave = normalizar(nombre);
    if (SIN_CLIENTE.has(clave)) return;
    const fila =
      porCliente.get(clave) ??
      { nombre: nombre.trim(), compras: 0, total: 0, contado: 0, fiado: 0, ultima: "", productos: new Map() };
    fila.compras += 1;
    fila.total += valor;
    if (aCredito) fila.fiado += valor;
    else fila.contado += valor;
    // Se muestra como lo escribieron la ultima vez.
    if (day >= fila.ultima) {
      fila.ultima = day;
      fila.nombre = nombre.trim();
    }
    for (const item of items) {
      const k = normalizar(item.name);
      const p = fila.productos.get(k) ?? { name: item.name, qty: 0 };
      p.qty += item.qty;
      fila.productos.set(k, p);
    }
    porCliente.set(clave, fila);
  };

  for (const v of ventas) sumar(v.clientName, v.day, v.total, false, v.items);
  for (const f of fiados) sumar(f.clientName, f.day, f.amount, true, renglonesDeConcepto(f.concept));

  return [...porCliente.values()]
    .map((f) => ({ ...f, productos: [...f.productos.values()].sort((a, b) => b.qty - a.qty) }))
    .sort((a, b) => b.total - a.total || b.compras - a.compras);
}
