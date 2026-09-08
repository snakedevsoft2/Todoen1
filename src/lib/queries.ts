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
