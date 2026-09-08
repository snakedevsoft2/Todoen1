import type { PaymentMethod } from "@prisma/client";
import { db } from "./db";

export type DaySummary = {
  day: string;
  salesCount: number;
  totalSales: number;
  totalExpenses: number;
  netTotal: number;
  byMethod: Record<PaymentMethod, number>;
  itemsSold: number;
  ticketAverage: number;
};

const EMPTY_METHODS: Record<PaymentMethod, number> = {
  EFECTIVO: 0,
  TARJETA: 0,
  TRANSFERENCIA: 0,
  OTRO: 0,
};

/** Resumen de dinero de un dia, siempre filtrado por el usuario dueno de los datos. */
export async function getDaySummary(userId: string, day: string): Promise<DaySummary> {
  const [sales, expenseAgg] = await Promise.all([
    db.sale.findMany({
      where: { userId, day },
      select: { total: true, paymentMethod: true, items: { select: { qty: true } } },
    }),
    db.expense.aggregate({ where: { userId, day }, _sum: { amount: true } }),
  ]);

  const byMethod: Record<PaymentMethod, number> = { ...EMPTY_METHODS };
  let totalSales = 0;
  let itemsSold = 0;

  for (const sale of sales) {
    totalSales += sale.total;
    byMethod[sale.paymentMethod] += sale.total;
    for (const item of sale.items) itemsSold += item.qty;
  }

  const totalExpenses = expenseAgg._sum.amount ?? 0;

  return {
    day,
    salesCount: sales.length,
    totalSales,
    totalExpenses,
    netTotal: totalSales - totalExpenses,
    byMethod,
    itemsSold,
    ticketAverage: sales.length ? Math.round(totalSales / sales.length) : 0,
  };
}

/** Totales por dia dentro de un rango, para la pagina de reportes. */
export async function getRangeTotals(userId: string, from: string, to: string) {
  const [sales, expenses] = await Promise.all([
    db.sale.findMany({
      where: { userId, day: { gte: from, lte: to } },
      select: { day: true, total: true, paymentMethod: true },
    }),
    db.expense.findMany({
      where: { userId, day: { gte: from, lte: to } },
      select: { day: true, amount: true },
    }),
  ]);

  const map = new Map<string, { day: string; sales: number; count: number; expenses: number }>();
  const ensure = (day: string) => {
    let row = map.get(day);
    if (!row) {
      row = { day, sales: 0, count: 0, expenses: 0 };
      map.set(day, row);
    }
    return row;
  };

  const byMethod: Record<PaymentMethod, number> = { ...EMPTY_METHODS };
  for (const sale of sales) {
    const row = ensure(sale.day);
    row.sales += sale.total;
    row.count += 1;
    byMethod[sale.paymentMethod] += sale.total;
  }
  for (const expense of expenses) ensure(expense.day).expenses += expense.amount;

  const rows = [...map.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0);
  const salesCount = rows.reduce((s, r) => s + r.count, 0);

  return {
    rows,
    totalSales,
    totalExpenses,
    salesCount,
    netTotal: totalSales - totalExpenses,
    byMethod,
  };
}

/** Ranking de lo mas vendido en un rango. */
export async function getTopItems(userId: string, from: string, to: string, limit = 10) {
  const items = await db.saleItem.findMany({
    where: { sale: { userId, day: { gte: from, lte: to } } },
    select: { name: true, qty: true, unitPrice: true },
  });

  const map = new Map<string, { name: string; qty: number; total: number }>();
  for (const item of items) {
    const row = map.get(item.name) ?? { name: item.name, qty: 0, total: 0 };
    row.qty += item.qty;
    row.total += item.unitPrice * item.qty;
    map.set(item.name, row);
  }

  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export type StaffTotals = {
  staffId: string;
  name: string;
  color: string;
  role: string;
  active: boolean;
  commissionPct: number;
  /** Plata que entro por lo que atendio esta persona. */
  totalSales: number;
  salesCount: number;
  /** Turnos que efectivamente atendio. */
  attended: number;
  /** Turnos que le separaron (sin contar los cancelados). */
  booked: number;
  noShow: number;
  ticketAverage: number;
  commission: number;
};

/**
 * Medicion por barbero dentro de un rango de dias.
 *
 * Cuenta la plata por la venta (Sale.staffId), no por el turno, porque hay
 * ventas sin turno: el cliente que llega sin reservar tambien suma.
 */
export async function getStaffTotals(
  userId: string,
  from: string,
  to: string
): Promise<{ rows: StaffTotals[]; unassigned: { totalSales: number; salesCount: number } }> {
  const [team, sales, appointments] = await Promise.all([
    db.staff.findMany({
      where: { userId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    db.sale.findMany({
      where: { userId, day: { gte: from, lte: to } },
      select: { staffId: true, total: true },
    }),
    db.appointment.findMany({
      where: { userId, day: { gte: from, lte: to } },
      select: { staffId: true, status: true },
    }),
  ]);

  const rows = new Map<string, StaffTotals>();
  for (const person of team) {
    rows.set(person.id, {
      staffId: person.id,
      name: person.name,
      color: person.color,
      role: person.role,
      active: person.active,
      commissionPct: person.commissionPct,
      totalSales: 0,
      salesCount: 0,
      attended: 0,
      booked: 0,
      noShow: 0,
      ticketAverage: 0,
      commission: 0,
    });
  }

  const unassigned = { totalSales: 0, salesCount: 0 };

  for (const sale of sales) {
    const row = sale.staffId ? rows.get(sale.staffId) : undefined;
    if (!row) {
      unassigned.totalSales += sale.total;
      unassigned.salesCount += 1;
      continue;
    }
    row.totalSales += sale.total;
    row.salesCount += 1;
  }

  for (const appointment of appointments) {
    const row = appointment.staffId ? rows.get(appointment.staffId) : undefined;
    if (!row) continue;
    if (appointment.status === "CANCELADO") continue;
    row.booked += 1;
    if (appointment.status === "ATENDIDO") row.attended += 1;
    if (appointment.status === "NO_ASISTIO") row.noShow += 1;
  }

  const out = [...rows.values()].map((row) => ({
    ...row,
    ticketAverage: row.salesCount ? Math.round(row.totalSales / row.salesCount) : 0,
    commission: Math.round((row.totalSales * row.commissionPct) / 100),
  }));

  // Primero quien mas vendio; los inactivos sin movimiento quedan al final.
  out.sort((a, b) => b.totalSales - a.totalSales || a.name.localeCompare(b.name));

  return { rows: out, unassigned };
}
