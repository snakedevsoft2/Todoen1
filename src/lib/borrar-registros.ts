import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { applyStockMove } from "./inventory";
import { quitarSello } from "./fidelizacion";

/**
 * Borrar una venta o un vehiculo del lavadero, con todo lo que cuelga de
 * ellos, para que los numeros sigan cuadrando.
 *
 * Vive aparte de las acciones (actions/sales.ts, actions/lavadero.ts) para
 * que borrar un vehiculo cobrado y borrar su venta desde Ventas hagan
 * exactamente lo mismo con la venta. La sesion, los permisos y la auditoria
 * los pone la accion. Lo que se le avisa al dueño antes de borrar esta en
 * lib/impacto-borrado.ts: si cambia lo que se hace aqui, cambia alla.
 */

const VENTA = {
  items: { select: { variantId: true, qty: true } },
  electronicInvoice: { select: { status: true } },
} satisfies Prisma.SaleInclude;

type VentaConDetalle = Prisma.SaleGetPayload<{ include: typeof VENTA }>;

/** Una factura autorizada, o camino a serlo, no se borra: se anula con nota credito ante la entidad. */
export function tieneFacturaEmitida(v: { electronicInvoice: { status: string } | null } | null | undefined): boolean {
  const estado = v?.electronicInvoice?.status;
  return estado === "AUTORIZADA" || estado === "ENVIANDO";
}

/**
 * Deshace todo lo que hizo la venta y la borra.
 *
 * `vehiculo`: que pasa con el vehiculo del lavado cobrado con ella. Desde
 * Ventas vuelve a Pendientes (se entrego, pero sin la venta vuelve a
 * deberse, igual que el ticket del parqueadero); al borrar el vehiculo, el
 * que llama lo borra despues.
 */
async function deshacerVenta(
  tx: Prisma.TransactionClient,
  userId: string,
  sale: VentaConDetalle,
  vehiculo: "a-pendientes" | "se-borra"
) {
  if (sale.appointmentId) {
    await tx.appointment.updateMany({ where: { id: sale.appointmentId, userId }, data: { status: "CONFIRMADO" } });
  }
  if (sale.orderId) {
    await tx.order.updateMany({ where: { id: sale.orderId, userId }, data: { status: "ABIERTA" } });
  }
  // El vehiculo ya salio: sin la venta, lo que cobro vuelve a deberse.
  if (sale.parkingTicketId) {
    await tx.parkingTicket.updateMany({
      where: { id: sale.parkingTicketId, userId, status: "PAGADO" },
      data: { status: "POR_COBRAR", amount: sale.total },
    });
  }
  if (sale.washJobId && vehiculo === "a-pendientes") {
    await tx.washJob.updateMany({
      where: { id: sale.washJobId, userId, status: "ENTREGADO" },
      data: { status: "POR_COBRAR", price: sale.total },
    });
  }

  // Lo que se vendio por talla vuelve al inventario.
  const devolver = new Map<string, number>();
  for (const item of sale.items) {
    if (item.variantId) devolver.set(item.variantId, (devolver.get(item.variantId) ?? 0) + item.qty);
  }
  for (const [variantId, qty] of devolver) {
    await applyStockMove(tx, { userId, variantId, type: "DEVOLUCION", delta: qty, day: sale.day, reason: "Venta borrada", saleId: sale.id });
  }

  const meta = await tx.user.findUnique({ where: { id: userId }, select: { loyaltyGoal: true } });
  await quitarSello(tx, { userId, saleId: sale.id, goal: meta?.loyaltyGoal ?? 10 });

  // La factura rechazada o con error no llego a existir ante la entidad.
  await tx.electronicInvoice.deleteMany({ where: { saleId: sale.id } });
  await tx.sale.delete({ where: { id: sale.id } });
}

export type VentaBorrada = { day: string; total: number; clientName: string | null };

/** Borra una venta del negocio. Null si no es suya o tiene factura emitida. */
export async function borrarVenta(userId: string, saleId: string): Promise<VentaBorrada | null> {
  const sale = await db.sale.findFirst({ where: { id: saleId, userId }, include: VENTA });
  if (!sale || tieneFacturaEmitida(sale)) return null;
  await db.$transaction((tx) => deshacerVenta(tx, userId, sale, "a-pendientes"));
  return { day: sale.day, total: sale.total, clientName: sale.clientName };
}

export type VehiculoBorrado = {
  clientName: string;
  vehiclePlate: string | null;
  /** Lo que se cobro, si tenia venta (tambien se borro). */
  ventaTotal: number | null;
};

/**
 * Borra un vehiculo del patio en cualquier estado. Si ya se cobro, borra
 * tambien su venta. Null si no es de este negocio o su venta tiene factura
 * emitida.
 */
export async function borrarVehiculo(userId: string, washJobId: string): Promise<VehiculoBorrado | null> {
  const job = await db.washJob.findFirst({ where: { id: washJobId, userId }, include: { sale: { include: VENTA } } });
  if (!job || tieneFacturaEmitida(job.sale)) return null;
  await db.$transaction(async (tx) => {
    if (job.sale) await deshacerVenta(tx, userId, job.sale, "se-borra");
    await tx.washJob.delete({ where: { id: job.id } });
  });
  return { clientName: job.clientName, vehiclePlate: job.vehiclePlate, ventaTotal: job.sale?.total ?? null };
}
