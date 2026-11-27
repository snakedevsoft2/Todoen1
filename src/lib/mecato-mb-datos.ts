import "server-only";
import { db } from "./db";
import { variantLabel } from "./variants";
import { esCategoriaDeMecato, type LineaVendida, type ProductoContable } from "./mecato-mb";

/**
 * Lo que lee la base para el inventario del mecato de MB Nails (ver
 * lib/mecato-mb.ts). Todo filtra por el userId de la sesion.
 */

export type FilaMecato = ProductoContable & {
  category: string;
  price: number;
  minStock: number;
};

/**
 * Cada bebida y cada paquete activo, con cuanto queda. Un producto con varias
 * presentaciones sale una vez por cada una; uno que todavia no se ha contado
 * sale una vez, sin contar.
 */
export async function productosDeMecato(userId: string): Promise<FilaMecato[]> {
  const servicios = await db.service.findMany({
    where: { userId, active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      price: true,
      category: true,
      trackStock: true,
      variants: {
        orderBy: [{ active: "desc" }, { createdAt: "asc" }],
        select: { id: true, size: true, color: true, stock: true, minStock: true, price: true, active: true },
      },
    },
  });

  const filas: FilaMecato[] = [];
  for (const s of servicios) {
    if (!esCategoriaDeMecato(s.category)) continue;
    const activas = s.variants.filter((v) => v.active);
    if (s.trackStock && activas.length > 0) {
      for (const v of activas) {
        filas.push({
          serviceId: s.id,
          variantId: v.id,
          name: activas.length > 1 ? s.name + " - " + variantLabel(v) : s.name,
          stock: v.stock,
          contado: true,
          category: s.category,
          price: v.price ?? s.price,
          minStock: v.minStock,
        });
      }
      continue;
    }
    const vieja = s.variants[0];
    filas.push({
      serviceId: s.id,
      variantId: vieja?.id ?? null,
      name: s.name,
      stock: vieja?.stock ?? 0,
      contado: false,
      category: s.category,
      price: s.price,
      minStock: vieja?.minStock ?? 0,
    });
  }
  return filas;
}

export type VentaDeMecato = LineaVendida & {
  id: string;
  day: string;
  cuando: Date;
  unitPrice: number;
  /** Quien la vendio (a nombre de quien quedo la venta). */
  vendio: string | null;
  clienta: string | null;
  pago: string;
};

/**
 * Cada bebida o paquete vendido entre dos dias: de las ventas (con su hora,
 * quien vendio, a quien y como pago) y de los fiados, que no son ventas pero
 * si descuentan el inventario. Lo mas nuevo primero.
 */
export async function vendidoDeMecato(
  userId: string,
  desde: string,
  hasta: string,
  filas: FilaMecato[]
): Promise<VentaDeMecato[]> {
  const serviceIds = [...new Set(filas.map((f) => f.serviceId))];
  const variantIds = filas.flatMap((f) => (f.variantId ? [f.variantId] : []));
  if (serviceIds.length === 0) return [];
  const nombre = new Map(filas.map((f) => [f.serviceId, f.name]));
  const precio = new Map(filas.flatMap((f) => (f.variantId ? [[f.variantId, f.price] as const] : [])));

  const [items, fiados] = await Promise.all([
    db.saleItem.findMany({
      where: {
        userId,
        sale: { userId, day: { gte: desde, lte: hasta } },
        OR: [{ serviceId: { in: serviceIds } }, ...(variantIds.length ? [{ variantId: { in: variantIds } }] : [])],
      },
      orderBy: { sale: { createdAt: "desc" } },
      take: 500,
      select: {
        id: true,
        serviceId: true,
        name: true,
        qty: true,
        unitPrice: true,
        sale: {
          select: {
            day: true,
            createdAt: true,
            clientName: true,
            paymentMethod: true,
            staff: { select: { name: true } },
          },
        },
      },
    }),
    // Un fiado no tiene items: lo que se llevo queda en el movimiento del
    // inventario ("Venta a crédito: Ana"), sin venta.
    variantIds.length
      ? db.stockMove.findMany({
          where: { userId, type: "VENTA", saleId: null, variantId: { in: variantIds }, day: { gte: desde, lte: hasta } },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { id: true, variantId: true, delta: true, day: true, createdAt: true, reason: true, variant: { select: { serviceId: true } } },
        })
      : Promise.resolve([]),
  ]);

  const lineas: VentaDeMecato[] = items.map((i) => ({
    id: i.id,
    clave: i.serviceId ?? "n:" + i.name,
    producto: (i.serviceId ? nombre.get(i.serviceId) : null) ?? i.name,
    qty: i.qty,
    unitPrice: i.unitPrice,
    total: i.unitPrice * i.qty,
    day: i.sale.day,
    cuando: i.sale.createdAt,
    vendio: i.sale.staff?.name ?? null,
    clienta: i.sale.clientName,
    pago: i.sale.paymentMethod,
  }));

  for (const m of fiados) {
    const qty = -m.delta;
    if (qty <= 0) continue;
    const unitPrice = precio.get(m.variantId) ?? 0;
    lineas.push({
      id: m.id,
      clave: m.variant.serviceId,
      producto: nombre.get(m.variant.serviceId) ?? "Producto",
      qty,
      unitPrice,
      total: unitPrice * qty,
      day: m.day,
      cuando: m.createdAt,
      vendio: null,
      clienta: (m.reason ?? "").replace(/^Venta a crédito:\s*/, "") || null,
      pago: "CREDITO",
    });
  }

  return lineas.sort((a, b) => b.cuando.getTime() - a.cuando.getTime());
}

/** Los ultimos movimientos del inventario del mecato: entradas, conteos, ventas y devoluciones. */
export async function movimientosDeMecato(userId: string, filas: FilaMecato[], take = 30) {
  const variantIds = filas.flatMap((f) => (f.variantId && f.contado ? [f.variantId] : []));
  if (variantIds.length === 0) return [];
  return db.stockMove.findMany({
    where: { userId, variantId: { in: variantIds } },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      delta: true,
      stockAfter: true,
      day: true,
      createdAt: true,
      reason: true,
      variantId: true,
      variant: { select: { service: { select: { name: true } } } },
    },
  });
}
