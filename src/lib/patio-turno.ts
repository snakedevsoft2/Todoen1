import type { PaymentMethod, Prisma, SaleOrigin, WashJobStatus } from "@prisma/client";
import { db } from "./db";
import { inicioDelDiaEn } from "./dates";

/**
 * Lo que el lavadero necesita saber de la jornada, ademas de las ventas:
 *
 *   - que vehiculos siguen en el patio sin entregar (de hoy o de antes);
 *   - de la plata que entro, cuanto es de los lavadores (su comision) y
 *     cuanto le queda al lavadero;
 *   - la entrega de turno: el jefe de patio que se va le deja al que llega
 *     los pendientes, lo cobrado en su turno y sus notas.
 *
 * Un vehiculo pendiente NO se pasa de dia: se queda con el dia en que llego y
 * el patio lo sigue mostrando hasta que se cobra o se cancela. Asi la venta
 * cae el dia en que de verdad se cobro y no hay que mover nada a medianoche.
 */

/** Lo que sigue abierto: en el patio, o entregado pero sin pagar (POR_COBRAR). */
export const ESTADOS_PENDIENTES: WashJobStatus[] = ["EN_COLA", "LAVANDO", "LISTO", "POR_COBRAR"];

export const ESTADO_PENDIENTE_LABEL: Record<string, string> = {
  EN_COLA: "En cola",
  LAVANDO: "Lavando",
  LISTO: "Listo",
  POR_COBRAR: "Pendiente",
};

/** Un turno que no se entrego en 24 horas ya no cuenta: el siguiente arranca en el dia. */
const TURNO_MAXIMO_MS = 24 * 60 * 60 * 1000;

export async function vehiculosPendientes(userId: string) {
  return db.washJob.findMany({
    where: { userId, status: { in: ESTADOS_PENDIENTES } },
    orderBy: { createdAt: "asc" },
    include: { assignedStaff: { select: { id: true, name: true, color: true } } },
  });
}

export type VentaParaReparto = {
  total: number;
  origin: SaleOrigin;
  staffId: string | null;
  staff: { commissionPct: number } | null;
};

export type Reparto = {
  total: number;
  /** Lo que se les debe a los lavadores por comision. */
  lavadores: number;
  /** Lo que le queda al lavadero: el total menos las comisiones. */
  lavadero: number;
  /** Comision y lo vendido por cada lavador, por id. */
  porLavador: Map<string, { count: number; total: number; comision: number }>;
};

/**
 * Parte la plata entre el lavadero y los lavadores.
 *
 * Solo los lavados (origin LAVADO) dan comision, y al lavador que lo lavo
 * (Sale.staffId). Un producto vendido en mostrador es todo del lavadero. La
 * comision se redondea por venta, que es como la ve el lavador en Mis lavados.
 */
export function repartir(ventas: VentaParaReparto[]): Reparto {
  let total = 0;
  let lavadores = 0;
  const porLavador: Reparto["porLavador"] = new Map();

  for (const v of ventas) {
    total += v.total;
    if (v.origin !== "LAVADO" || !v.staffId) continue;
    const comision = Math.round((v.total * (v.staff?.commissionPct ?? 0)) / 100);
    lavadores += comision;
    const fila = porLavador.get(v.staffId) ?? { count: 0, total: 0, comision: 0 };
    fila.count += 1;
    fila.total += v.total;
    fila.comision += comision;
    porLavador.set(v.staffId, fila);
  }

  return { total, lavadores, lavadero: total - lavadores, porLavador };
}

const SELECT_VENTA = {
  total: true,
  origin: true,
  staffId: true,
  paymentMethod: true,
  staff: { select: { commissionPct: true } },
} satisfies Prisma.SaleSelect;

/** El reparto de un dia completo, para el resumen del dia. */
export async function repartoDelDia(userId: string, day: string) {
  const ventas = await db.sale.findMany({ where: { userId, day }, select: SELECT_VENTA });
  return repartir(ventas);
}

/**
 * Desde cuando cuenta el turno de quien va a entregar: desde la ultima entrega
 * (la de cualquier jefe de patio, porque el patio es uno solo), o desde el
 * inicio del dia si hoy nadie ha entregado todavia.
 */
export async function inicioDelTurno(userId: string, hoy: string, timezone: string, ahora = new Date()) {
  const ultima = await db.patioHandover.findFirst({
    where: { userId, createdAt: { gte: new Date(ahora.getTime() - TURNO_MAXIMO_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return ultima?.createdAt ?? inicioDelDiaEn(hoy, timezone);
}

export type ResumenTurno = {
  since: Date;
  vehiclesDelivered: number;
  salesCount: number;
  byMethod: Record<PaymentMethod, number>;
  totalExpenses: number;
  reparto: Reparto;
  /** El efectivo que deberia haber: lo cobrado en efectivo menos los gastos. */
  expectedCash: number;
};

/** Lo que paso en el patio entre `since` y `hasta`: lo que se entrega al siguiente. */
export async function resumenDelTurno(userId: string, since: Date, hasta = new Date()): Promise<ResumenTurno> {
  const enElTurno = { gte: since, lte: hasta };
  const [ventas, gastos, entregados] = await Promise.all([
    db.sale.findMany({ where: { userId, createdAt: enElTurno }, select: SELECT_VENTA }),
    db.expense.aggregate({ where: { userId, createdAt: enElTurno }, _sum: { amount: true } }),
    db.washJob.count({ where: { userId, status: "ENTREGADO", deliveredAt: enElTurno } }),
  ]);

  const byMethod: Record<PaymentMethod, number> = { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, OTRO: 0 };
  for (const v of ventas) byMethod[v.paymentMethod] += v.total;
  const totalExpenses = gastos._sum.amount ?? 0;

  return {
    since,
    vehiclesDelivered: entregados,
    salesCount: ventas.length,
    byMethod,
    totalExpenses,
    reparto: repartir(ventas),
    expectedCash: byMethod.EFECTIVO - totalExpenses,
  };
}

export type PendienteEnEntrega = {
  id: string;
  day: string;
  clientName: string;
  vehiclePlate: string | null;
  vehicleType: string | null;
  serviceName: string;
  price: number;
  status: string;
  lavador: string | null;
};

/**
 * Deja la entrega de turno: congela lo que paso en el turno y la lista de
 * vehiculos que quedan en el patio. Los vehiculos no cambian: siguen en el
 * tablero para el que llega.
 */
export async function entregarTurno(
  userId: string,
  datos: {
    day: string;
    since: Date;
    fromStaffId: string;
    toStaffId: string | null;
    cashDelivered: number;
    notes: string | null;
  },
  ahora = new Date()
) {
  const [resumen, pendientes] = await Promise.all([
    resumenDelTurno(userId, datos.since, ahora),
    vehiculosPendientes(userId),
  ]);

  const snapshot: PendienteEnEntrega[] = pendientes.map((j) => ({
    id: j.id,
    day: j.day,
    clientName: j.clientName,
    vehiclePlate: j.vehiclePlate,
    vehicleType: j.vehicleType,
    serviceName: j.serviceName,
    price: j.price,
    status: j.status,
    lavador: j.assignedStaff?.name ?? null,
  }));

  return db.patioHandover.create({
    data: {
      userId,
      day: datos.day,
      since: datos.since,
      fromStaffId: datos.fromStaffId,
      toStaffId: datos.toStaffId,
      vehiclesDelivered: resumen.vehiclesDelivered,
      totalSales: resumen.reparto.total,
      totalCash: resumen.byMethod.EFECTIVO,
      totalCard: resumen.byMethod.TARJETA,
      totalTransfer: resumen.byMethod.TRANSFERENCIA,
      totalOther: resumen.byMethod.OTRO,
      totalExpenses: resumen.totalExpenses,
      totalCommissions: resumen.reparto.lavadores,
      pendingCount: snapshot.length,
      pendingValue: snapshot.reduce((sum, p) => sum + p.price, 0),
      pendingSnapshot: snapshot,
      cashDelivered: datos.cashDelivered,
      notes: datos.notes,
      createdAt: ahora,
    },
  });
}

/** El que llega confirma que recibio el patio. Quien entrego no puede recibirse a si mismo. */
export async function recibirEntrega(userId: string, handoverId: string, staffId: string) {
  return db.patioHandover.updateMany({
    where: { id: handoverId, userId, receivedAt: null, NOT: { fromStaffId: staffId } },
    data: { receivedAt: new Date(), receivedById: staffId },
  });
}

/** La entrega que le espera a esta persona: la ultima sin recibir que no hizo ella. */
export async function entregaPorRecibir(userId: string, staffId: string) {
  return db.patioHandover.findFirst({
    where: {
      userId,
      receivedAt: null,
      NOT: { fromStaffId: staffId },
      OR: [{ toStaffId: staffId }, { toStaffId: null }],
    },
    orderBy: { createdAt: "desc" },
    include: { fromStaff: { select: { name: true } } },
  });
}
