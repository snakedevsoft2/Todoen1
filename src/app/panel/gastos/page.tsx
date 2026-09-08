import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isValidDay, startOfMonth, todayIn } from "@/lib/dates";
import { money, prettyDay } from "@/lib/format";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { NewExpenseForm } from "@/components/NewExpenseForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { deleteExpenseAction } from "@/actions/expenses";
import { getDaySummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayIn(user.timezone);
  const day = params.d && isValidDay(params.d) ? params.d : today;
  const monthStart = startOfMonth(day);

  const [expenses, monthAgg, summary] = await Promise.all([
    db.expense.findMany({ where: { userId: user.id, day }, orderBy: { createdAt: "desc" } }),
    db.expense.aggregate({
      where: { userId: user.id, day: { gte: monthStart, lte: day } },
      _sum: { amount: true },
      _count: true,
    }),
    getDaySummary(user.id, day),
  ]);

  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});

  return (
    <>
      <PageHeader title="Gastos" subtitle={prettyDay(day)} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={"/panel/gastos?d=" + addDays(day, -1)} className="btn-ghost btn-sm">
          Dia anterior
        </Link>
        <Link href="/panel/gastos" className="btn-ghost btn-sm">
          Hoy
        </Link>
        <Link href={"/panel/gastos?d=" + addDays(day, 1)} className="btn-ghost btn-sm">
          Dia siguiente
        </Link>
        <form className="ml-auto flex items-center gap-2" action="/panel/gastos">
          <input className="input max-w-[170px] py-1.5 text-sm" type="date" name="d" defaultValue={day} />
          <button className="btn-ghost btn-sm" type="submit">
            Ir
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gasto del dia" value={money(summary.totalExpenses, user.currency)} tone="bad" />
        <Stat label="Ventas del dia" value={money(summary.totalSales, user.currency)} tone="brand" />
        <Stat
          label="Te queda limpio"
          value={money(summary.netTotal, user.currency)}
          tone={summary.netTotal >= 0 ? "good" : "bad"}
        />
        <Stat
          label="Gasto del mes"
          value={money(monthAgg._sum.amount ?? 0, user.currency)}
          hint={monthAgg._count + " gastos anotados"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card title="Anotar un gasto" subtitle="Todo lo que sale de la caja">
          <NewExpenseForm day={day} />
        </Card>

        <div className="space-y-4">
          <Card title="Gastos del dia">
            {expenses.length === 0 ? (
              <Empty title="No hay gastos en este dia" hint="Anota insumos, compras o pagos." />
            ) : (
              <ul className="divide-y divide-line/60">
                {expenses.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{e.description}</p>
                      <p className="text-xs text-slate-500">{e.category}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-rose-300">
                        -{money(e.amount, user.currency)}
                      </span>
                      <form action={deleteExpenseAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <SubmitButton
                          className="btn-ghost btn-sm px-2 text-rose-300"
                          pendingText="..."
                          confirm="Borrar este gasto"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {Object.keys(byCategory).length > 0 && (
            <Card title="Por categoria" subtitle="Como se reparte el gasto del dia">
              <ul className="space-y-2">
                {Object.entries(byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, amount]) => {
                    const pct = summary.totalExpenses
                      ? Math.round((amount / summary.totalExpenses) * 100)
                      : 0;
                    return (
                      <li key={category}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-slate-300">{category}</span>
                          <span className="font-semibold text-slate-200">
                            {money(amount, user.currency)} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-ink">
                          <div className="h-full rounded-full bg-rose-400/70" style={{ width: pct + "%" }} />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
