import { requireUser } from "@/lib/auth";
import { addDays, isValidDay, startOfMonth, todayIn } from "@/lib/dates";
import { money, shortDay } from "@/lib/format";
import { getRangeTotals, getTopItems } from "@/lib/queries";
import { ITEM_NOUN } from "@/lib/nav";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayIn(user.timezone);

  const to = params.to && isValidDay(params.to) ? params.to : today;
  const from =
    params.from && isValidDay(params.from) ? params.from : startOfMonth(to) <= to ? startOfMonth(to) : to;
  const safeFrom = from <= to ? from : to;

  const [totals, topItems] = await Promise.all([
    getRangeTotals(user.id, safeFrom, to),
    getTopItems(user.id, safeFrom, to, 10),
  ]);

  const maxSales = Math.max(1, ...totals.rows.map((r) => r.sales));
  const days = totals.rows.length || 1;

  const presets = [
    { label: "Hoy", from: today, to: today },
    { label: "Ultimos 7 dias", from: addDays(today, -6), to: today },
    { label: "Ultimos 30 dias", from: addDays(today, -29), to: today },
    { label: "Este mes", from: startOfMonth(today), to: today },
  ];

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle={"Del " + shortDay(safeFrom) + " al " + shortDay(to)}
      />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        {presets.map((p) => (
          <a
            key={p.label}
            href={"/panel/reportes?from=" + p.from + "&to=" + p.to}
            className={
              "btn-ghost btn-sm " +
              (p.from === safeFrom && p.to === to ? "border-brand-400 text-brand-200" : "")
            }
          >
            {p.label}
          </a>
        ))}
        <form className="ml-auto flex flex-wrap items-end gap-2" action="/panel/reportes">
          <label className="block">
            <span className="label">Desde</span>
            <input className="input max-w-[160px] py-1.5 text-sm" type="date" name="from" defaultValue={safeFrom} />
          </label>
          <label className="block">
            <span className="label">Hasta</span>
            <input className="input max-w-[160px] py-1.5 text-sm" type="date" name="to" defaultValue={to} />
          </label>
          <button className="btn-primary btn-sm" type="submit">
            Ver
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Vendido en el periodo" value={money(totals.totalSales, user.currency)} tone="brand" />
        <Stat label="Gastado en el periodo" value={money(totals.totalExpenses, user.currency)} tone="bad" />
        <Stat
          label="Ganancia"
          value={money(totals.netTotal, user.currency)}
          tone={totals.netTotal >= 0 ? "good" : "bad"}
        />
        <Stat
          label="Promedio por dia"
          value={money(Math.round(totals.totalSales / days), user.currency)}
          hint={totals.salesCount + " ventas en total"}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Efectivo" value={money(totals.byMethod.EFECTIVO, user.currency)} />
        <Stat label="Tarjeta" value={money(totals.byMethod.TARJETA, user.currency)} />
        <Stat label="Transferencia" value={money(totals.byMethod.TRANSFERENCIA, user.currency)} />
        <Stat label="Otros" value={money(totals.byMethod.OTRO, user.currency)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Dia por dia" subtitle="Ventas, gastos y lo que quedo limpio">
          {totals.rows.length === 0 ? (
            <Empty title="No hay movimientos en este periodo" />
          ) : (
            <div className="space-y-3">
              {totals.rows.map((row) => (
                <div key={row.day}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300">{shortDay(row.day)}</span>
                    <span className="text-slate-400">
                      {money(row.sales, user.currency)} vendido - {money(row.expenses, user.currency)} gasto
                      {" = "}
                      <span
                        className={
                          row.sales - row.expenses >= 0 ? "text-emerald-300" : "text-rose-300"
                        }
                      >
                        {money(row.sales - row.expenses, user.currency)}
                      </span>
                    </span>
                  </div>
                  <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-ink">
                    <div
                      className="h-full bg-brand-400"
                      style={{ width: (row.sales / maxSales) * 100 + "%" }}
                    />
                    <div
                      className="h-full bg-rose-400/70"
                      style={{ width: (row.expenses / maxSales) * 100 + "%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={"Lo mas vendido"} subtitle={"Tus " + ITEM_NOUN[user.businessType].plural + " top"}>
          {topItems.length === 0 ? (
            <Empty title="Sin datos todavia" hint="Registra ventas para ver este ranking." />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Cantidad</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.map((item) => (
                    <tr key={item.name}>
                      <td className="font-medium text-white">{item.name}</td>
                      <td className="text-right">{item.qty}</td>
                      <td className="text-right font-semibold text-brand-300">
                        {money(item.total, user.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
