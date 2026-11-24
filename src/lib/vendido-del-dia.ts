import { renglonesDeConcepto } from "./mejores-clientes";
import { normalizar } from "./orden-productos";

/**
 * Lo vendido en un dia contando los fiados (lo pidio Chopo Snacks).
 *
 * En los demas negocios un fiado no es venta hasta que se cobra: cada abono
 * entra como venta del dia en que se recibe. Chopo vende casi todo a credito
 * y quiere ver en Ventas lo que salio ese dia, de contado y fiado, con sus
 * productos. Entonces:
 *   - el fiado cuenta entero el dia que se llevo la mercancia;
 *   - los abonos (ventas de origen CARTERA) NO suman al vendido: son la plata
 *     de un fiado que ya se conto; sumarlos tambien seria contar dos veces la
 *     misma venta. Se muestran aparte para que no se pierdan de vista;
 *   - el fiado que ya se habia registrado en Ventas (alreadyInvoiced) tampoco
 *     suma otra vez.
 * Es lo mismo que hace Mejores clientes (ver mejores-clientes.ts).
 *
 * Solo cambia lo que se muestra en Ventas: la caja sigue contando la plata
 * que entro, abonos incluidos.
 */

export type VentaDelDia = {
  origin: string;
  total: number;
  items: { name: string; qty: number; unitPrice: number }[];
};

export type FiadoDelDia = { concept: string; amount: number; alreadyInvoiced: boolean };

export type ProductoVendido = { name: string; qty: number; total: number };

export type VendidoDelDia = {
  /** Contado + fiado. */
  total: number;
  contado: number;
  fiado: number;
  /** Abonos de fiados recibidos ese dia: plata que entro, pero no es venta nueva. */
  abonos: number;
  /** Cuantas ventas y fiados (sin los abonos). */
  movimientos: number;
  /** De lo que mas salio a lo que menos. */
  productos: ProductoVendido[];
};

export const esAbono = (v: Pick<VentaDelDia, "origin">) => v.origin === "CARTERA";

/**
 * Los productos de un fiado con su parte del valor. El concepto no trae
 * precios, asi que el valor del fiado se reparte segun el precio del
 * catalogo de cada producto: asi la suma da justo lo que se fio aunque el
 * precio haya cambiado. Si alguno ya no esta en el catalogo, se toma el
 * precio promedio de los demas (o se reparte por cantidad si no hay ninguno).
 */
export function productosDelFiado(f: Pick<FiadoDelDia, "concept" | "amount">, precios: Map<string, number>): ProductoVendido[] {
  const renglones = renglonesDeConcepto(f.concept).filter((r) => r.qty > 0);
  if (renglones.length === 0) return [];
  const conocidos = renglones.filter((r) => (precios.get(normalizar(r.name)) ?? 0) > 0);
  const promedio = conocidos.length
    ? conocidos.reduce((s, r) => s + r.qty * precios.get(normalizar(r.name))!, 0) / conocidos.reduce((s, r) => s + r.qty, 0)
    : 1;
  const pesos = renglones.map((r) => r.qty * ((precios.get(normalizar(r.name)) ?? 0) > 0 ? precios.get(normalizar(r.name))! : promedio));
  const suma = pesos.reduce((s, p) => s + p, 0);

  let repartido = 0;
  return renglones.map((r, i) => {
    // El ultimo se lleva lo que sobre del redondeo: la suma queda exacta.
    const total = i === renglones.length - 1 ? f.amount - repartido : Math.round((f.amount * pesos[i]) / suma);
    repartido += total;
    return { name: r.name, qty: r.qty, total };
  });
}

/** Juntar por nombre sin tildes ni mayusculas: "Chicharrón grande" y "chicharron grande" son el mismo. */
function agrupar(filas: ProductoVendido[]): ProductoVendido[] {
  const porNombre = new Map<string, ProductoVendido>();
  for (const f of filas) {
    const clave = normalizar(f.name);
    const fila = porNombre.get(clave) ?? { name: f.name, qty: 0, total: 0 };
    fila.qty += f.qty;
    fila.total += f.total;
    porNombre.set(clave, fila);
  }
  return [...porNombre.values()].sort((a, b) => b.qty - a.qty || b.total - a.total);
}

/** `precios`: el precio de catalogo de cada producto, por su nombre normalizado. */
export function vendidoDelDia(ventas: VentaDelDia[], fiados: FiadoDelDia[], precios: Map<string, number>): VendidoDelDia {
  const deContado = ventas.filter((v) => !esAbono(v));
  const fiadosNuevos = fiados.filter((f) => !f.alreadyInvoiced);
  const contado = deContado.reduce((s, v) => s + v.total, 0);
  const fiado = fiadosNuevos.reduce((s, f) => s + f.amount, 0);
  const abonos = ventas.filter(esAbono).reduce((s, v) => s + v.total, 0);

  const productos = agrupar([
    ...deContado.flatMap((v) => v.items.map((i) => ({ name: i.name, qty: i.qty, total: i.qty * i.unitPrice }))),
    ...fiadosNuevos.flatMap((f) => productosDelFiado(f, precios)),
  ]);

  return { total: contado + fiado, contado, fiado, abonos, movimientos: deContado.length + fiadosNuevos.length, productos };
}
