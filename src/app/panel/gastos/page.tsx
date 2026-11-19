import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isValidDay, startOfMonth, todayIn } from "@/lib/dates";
import { money, prettyDay, shortDay } from "@/lib/format";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { NewExpenseForm } from "@/components/NewExpenseForm";
import { Icon } from "@/components/Icon";
import { deleteExpenseAction } from "@/actions/expenses";
import { BotonBorrar } from "@/components/BotonBorrar";
import { avisoBorrarGasto } from "@/lib/impacto-borrado";
import { getDaySummary } from "@/lib/queries";
import { FormSinSenal } from "@/components/SinSenal";
import { esChopoSnacks } from "@/lib/orden-productos";
import { rangoDeFechas } from "@/lib/rango-fechas";

export const dynamic = "force-dynamic";

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; desde?: string; hasta?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayIn(user.timezone);

  // Chopo Snacks pidio ver los gastos de un rango de fechas, desde y hasta
  // (ver esChopoSnacks). Los demas negocios siguen viendo un dia.
  const chopo = esChopoSnacks(user.businessName);
  const rango = chopo ? rangoDeFechas(params.desde, params.hasta) : null;
  const day = rango && !rango.varios ? rango.desde : params.d && isValidDay(params.d) ? params.d : today;
  const desde = rango?.desde ?? day;
  const hasta = rango?.hasta ?? day;
  const varios = Boolean(rango?.varios);
  const monthStart = startOfMonth(day);

  const [expenses, monthAgg, summary, cierres, ventasRango] = await Promise.all([
    db.expense.findMany({
      where: { userId: user.id, day: varios ? { gte: desde, lte: hasta } : day },
      orderBy: varios ? [{ day: "desc" }, { createdAt: "desc" }] : { createdAt: "desc" },
    }),
    varios
      ? null
      : db.expense.aggregate({
          where: { userId: user.id, day: { gte: monthStart, lte: day } },
          _sum: { amount: true },
          _count: true,
        }),
    varios ? null : getDaySummary(user.id, day),
    // Para avisar, antes de borrar un gasto, si la caja de ese dia ya se cerro.
    db.cashClosure.findMany({
      where: { userId: user.id, day: varios ? { gte: desde, lte: hasta } : day },
      select: { day: true },
      distinct: ["day"],
    }),
    varios
      ? db.sale.aggregate({ where: { userId: user.id, day: { gte: desde, lte: hasta } }, _sum: { total: true } })
      : null,
  ]);
  const diasCerrados = new Set(cierres.map((c) => c.day));

  const totalGastos = varios ? expenses.reduce((s, e) => s + e.amount, 0) : summary!.totalExpenses;
  const totalVentas = varios ? (ventasRango?._sum.total ?? 0) : summary!.totalSales;
  const neto = totalVentas - totalGastos;

  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});

  // En un rango, los gastos van agrupados por dia, el mas reciente arriba.
  const porDia = new Map<string, typeof expenses>();
  for (const e of expenses) porDia.set(e.day, [...(porDia.get(e.day) ?? []), e]);
  const diasDelRango = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1;

  const filaGasto = (e: (typeof expenses)[number]) => (
    <li key={e.id} className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-strong">{e.description}</p>
        <p className="text-xs text-subtle">{e.category}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-bad">-{money(e.amount, user.currency)}</span>
        <FormSinSenal accion="deleteExpenseAction" servidor={deleteExpenseAction}>
          <input type="hidden" name="id" value={e.id} />
          <BotonBorrar
            ariaLabel="Borrar gasto"
            aviso={avisoBorrarGasto(e, { currency: user.currency, cajaCerrada: diasCerrados.has(e.day) })}
          >
            <Icon name="trash" className="h-4 w-4" />
          </BotonBorrar>
        </FormSinSenal>
      </div>
    </li>
  );

  return (
    <>
      <PageHeader
        title="Gastos"
        subtitle={varios ? "Del " + shortDay(desde) + " al " + shortDay(hasta) : prettyDay(day)}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!varios && (
          <Link href={"/panel/gastos?d=" + addDays(day, -1)} className="btn-ghost btn-sm">
            Dia anterior
          </Link>
        )}
        <Link href="/panel/gastos" className="btn-ghost btn-sm">
          Hoy
        </Link>
        {!varios && (
          <Link href={"/panel/gastos?d=" + addDays(day, 1)} className="btn-ghost btn-sm">
            Dia siguiente
          </Link>
        )}
        {chopo && (
          <Link
            href={"/panel/gastos?desde=" + startOfMonth(today) + "&hasta=" + today}
            className="btn-ghost btn-sm"
          >
            Este mes
          </Link>
        )}
        {chopo ? (
          <form
            className="grid w-full grid-cols-[1fr_1fr_auto] items-end gap-2 sm:ml-auto sm:w-auto"
            action="/panel/gastos"
            data-rango-gastos
          >
            <label className="min-w-0 text-xs text-muted">
              Desde
              <input className="input mt-1 w-full py-1.5 text-sm" type="date" name="desde" defaultValue={desde} />
            </label>
            <label className="min-w-0 text-xs text-muted">
              Hasta
              <input className="input mt-1 w-full py-1.5 text-sm" type="date" name="hasta" defaultValue={hasta} />
            </label>
            <button className="btn-primary btn-sm" type="submit">
              Ver
            </button>
          </form>
        ) : (
          <form className="ml-auto flex items-center gap-2" action="/panel/gastos">
            <input className="input max-w-[170px] py-1.5 text-sm" type="date" name="d" defaultValue={day} />
            <button className="btn-ghost btn-sm" type="submit">
              Ir
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={varios ? "Gasto del periodo" : "Gasto del día"}
          value={money(totalGastos, user.currency)}
          tone="bad"
        />
        <Stat
          label={varios ? "Ventas del periodo" : "Ventas del día"}
          value={money(totalVentas, user.currency)}
          tone="brand"
        />
        <Stat label="Te queda limpio" value={money(neto, user.currency)} tone={neto >= 0 ? "good" : "bad"} />
        {varios ? (
          <Stat
            label="Gastos anotados"
            value={String(expenses.length)}
            hint={
              diasDelRango + " días · " + money(Math.round(totalGastos / diasDelRango), user.currency) + " por día"
            }
          />
        ) : (
          <Stat
            label="Gasto del mes"
            value={money(monthAgg?._sum.amount ?? 0, user.currency)}
            hint={(monthAgg?._count ?? 0) + " gastos anotados"}
          />
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card title="Anotar un gasto" subtitle="Todo lo que sale de la caja">
          <NewExpenseForm day={varios ? (today >= desde && today <= hasta ? today : hasta) : day} currency={user.currency} />
        </Card>

        <div className="space-y-4">
          <Card title={varios ? "Gastos del periodo" : "Gastos del día"}>
            {expenses.length === 0 ? (
              <Empty
                title={varios ? "No hay gastos en esas fechas" : "No hay gastos en este día"}
                hint="Anota insumos, compras o pagos."
              />
            ) : varios ? (
              <div className="space-y-4" data-gastos-por-dia>
                {[...porDia.entries()].map(([dia, lista]) => (
                  <section key={dia}>
                    <h3 className="flex items-center justify-between gap-2 border-b border-line pb-1.5 text-xs font-bold text-strong">
                      <span>{prettyDay(dia).replace(/^./, (c) => c.toUpperCase())}</span>
                      <span className="text-bad">
                        -{money(lista.reduce((s, e) => s + e.amount, 0), user.currency)}
                      </span>
                    </h3>
                    <ul className="divide-y divide-line">{lista.map(filaGasto)}</ul>
                  </section>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-line">{expenses.map(filaGasto)}</ul>
            )}
          </Card>

          {Object.keys(byCategory).length > 0 && (
            <Card
              title="Por categoría"
              subtitle={varios ? "Cómo se reparte el gasto del periodo" : "Cómo se reparte el gasto del día"}
            >
              <ul className="space-y-2">
                {Object.entries(byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, amount]) => {
                    const pct = totalGastos ? Math.round((amount / totalGastos) * 100) : 0;
                    return (
                      <li key={category}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-body">{category}</span>
                          <span className="font-semibold text-body">
                            {money(amount, user.currency)} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-panel">
                          <div className="h-full rounded-full bg-bad" style={{ width: pct + "%" }} />
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
