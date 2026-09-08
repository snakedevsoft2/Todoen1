import { requireUser } from "@/lib/auth";
import { addDays, isValidDay, startOfMonth, todayIn } from "@/lib/dates";
import { money, shortDay } from "@/lib/format";
import { getRangeTotals, getStaffTotals, getTopItems } from "@/lib/queries";
import { ITEM_NOUN } from "@/lib/nav";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { StaffDot } from "@/components/StaffForms";

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

  const isBarber = user.businessType === "BARBERIA";

  const [totals, topItems, staffTotals] = await Promise.all([
    getRangeTotals(user.id, safeFrom, to),
    getTopItems(user.id, safeFrom, to, 10),
    getStaffTotals(user.id, safeFrom, to),
  ]);

  // Solo tiene sentido comparar cuando hay mas de una persona atendiendo.
  const staffRows = staffTotals.rows.filter((r) => r.active || r.totalSales > 0 || r.booked > 0);
  const showStaff = isBarber && staffRows.length > 1;
  const maxStaffSales = Math.max(1, ...staffRows.map((r) => r.totalSales));

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
              (p.from === safeFrom && p.to === to ? "border-brand-500 text-brand-700" : "")
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

      {showStaff && (
        <div className="mt-5">
          <Card
            title="Medicion por barbero"
            subtitle="Cuanto atendio y cuanto entro por cada uno en este periodo"
          >
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Barbero</th>
                    <th className="text-right">Turnos</th>
                    <th className="text-right">Atendidos</th>
                    <th className="text-right">No asistio</th>
                    <th className="text-right">Ventas</th>
                    <th className="text-right">Vendido</th>
                    <th className="text-right">Ticket promedio</th>
                    <th className="text-right">Comision</th>
                  </tr>
                </thead>
                <tbody>
                  {staffRows.map((row) => (
                    <tr key={row.staffId}>
                      <td>
                        <span className="flex items-center gap-2">
                          <StaffDot name={row.name} color={row.color} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-strong">
                              {row.name}
                            </span>
                            <span className="block text-[11px] text-subtle">
                              {row.role === "DUENO" ? "Dueno" : "Barbero"}
                              {row.active ? "" : " - inactivo"}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="text-right">{row.booked}</td>
                      <td className="text-right">{row.attended}</td>
                      <td className="text-right">{row.noShow}</td>
                      <td className="text-right">{row.salesCount}</td>
                      <td className="text-right font-semibold text-brand-600">
                        {money(row.totalSales, user.currency)}
                      </td>
                      <td className="text-right">{money(row.ticketAverage, user.currency)}</td>
                      <td className="text-right">
                        {row.commissionPct > 0 ? money(row.commission, user.currency) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-3">
              {staffRows.map((row) => (
                <div key={row.staffId}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-body">{row.name}</span>
                    <span className="text-muted">
                      {money(row.totalSales, user.currency)}
                      {totals.totalSales > 0
                        ? " - " + Math.round((row.totalSales / totals.totalSales) * 100) + "% del total"
                        : ""}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-panel">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: (row.totalSales / maxStaffSales) * 100 + "%",
                        backgroundColor: row.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {staffTotals.unassigned.salesCount > 0 && (
              <p className="mt-4 rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">
                {money(staffTotals.unassigned.totalSales, user.currency)} en{" "}
                {staffTotals.unassigned.salesCount} ventas quedaron sin barbero asignado. Al
                registrar una venta, elige quien la atendio para que la medicion cuadre.
              </p>
            )}
          </Card>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Dia por dia" subtitle="Ventas, gastos y lo que quedo limpio">
          {totals.rows.length === 0 ? (
            <Empty title="No hay movimientos en este periodo" />
          ) : (
            <div className="space-y-3">
              {totals.rows.map((row) => (
                <div key={row.day}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-body">{shortDay(row.day)}</span>
                    <span className="text-muted">
                      {money(row.sales, user.currency)} vendido - {money(row.expenses, user.currency)} gasto
                      {" = "}
                      <span
                        className={
                          row.sales - row.expenses >= 0 ? "text-good" : "text-bad"
                        }
                      >
                        {money(row.sales - row.expenses, user.currency)}
                      </span>
                    </span>
                  </div>
                  <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-panel">
                    <div
                      className="h-full bg-brand-400"
                      style={{ width: (row.sales / maxSales) * 100 + "%" }}
                    />
                    <div
                      className="h-full bg-bad"
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
                      <td className="font-medium text-strong">{item.name}</td>
                      <td className="text-right">{item.qty}</td>
                      <td className="text-right font-semibold text-brand-600">
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
