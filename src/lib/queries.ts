import type { PaymentMethod } from "@prisma/client";
import { db } from "./db";
import { variantLabel } from "./variants";

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

export type ClothingStats = {
  /** Prendas fisicas que salieron en el rango. */
  unitsSold: number;
  /** Plata que entro por esas prendas. */
  revenue: number;
  /** Lo que costo la mercancia vendida. */
  cost: number;
  grossProfit: number;
  /** Utilidad sobre la venta, en porcentaje. */
  marginPct: number;
  /** Cuantas prendas se vendieron sin costo cargado (el margen las ignora). */
  withoutCost: number;
  topSizes: { label: string; qty: number }[];
  topCategories: { name: string; qty: number; total: number }[];
};

/**
 * Medicion propia de la tienda de ropa: cuanto se vendio, cuanto costo y que
 * tallas se mueven.
 *
 * El costo sale del que tiene hoy la talla (o la prenda), no del que tenia el
 * dia de la venta: es una aproximacion suficiente para saber si el negocio
 * esta ganando, y evita guardar el costo en cada linea de venta.
 */
export async function getClothingStats(
  userId: string,
  from: string,
  to: string
): Promise<ClothingStats> {
  const items = await db.saleItem.findMany({
    where: { sale: { userId, day: { gte: from, lte: to } } },
    select: {
      qty: true,
      unitPrice: true,
      variant: { select: { cost: true, size: true, color: true } },
      service: { select: { cost: true, category: true } },
    },
  });

  let unitsSold = 0;
  let revenue = 0;
  let cost = 0;
  let withoutCost = 0;

  const sizes = new Map<string, number>();
  const categories = new Map<string, { name: string; qty: number; total: number }>();

  for (const item of items) {
    const lineTotal = item.unitPrice * item.qty;
    unitsSold += item.qty;
    revenue += lineTotal;

    const unitCost = item.variant?.cost || item.service?.cost || 0;
    if (unitCost > 0) cost += unitCost * item.qty;
    else withoutCost += item.qty;

    if (item.variant) {
      const label = variantLabel(item.variant);
      sizes.set(label, (sizes.get(label) ?? 0) + item.qty);
    }

    const categoryName = item.service?.category ?? "Sin categoria";
    const row = categories.get(categoryName) ?? { name: categoryName, qty: 0, total: 0 };
    row.qty += item.qty;
    row.total += lineTotal;
    categories.set(categoryName, row);
  }

  const grossProfit = revenue - cost;

  return {
    unitsSold,
    revenue,
    cost,
    grossProfit,
    marginPct: revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0,
    withoutCost,
    topSizes: [...sizes.entries()]
      .map(([label, qty]) => ({ label, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8),
    topCategories: [...categories.values()].sort((a, b) => b.total - a.total).slice(0, 6),
  };
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
