import { requireUser } from "@/lib/auth";
import { addDays, isValidDay, startOfMonth, todayIn } from "@/lib/dates";
import { money, shortDay } from "@/lib/format";
import {
  getClothingStats,
  getComparison,
  getRangeTotals,
  getStaffTotals,
  getTopItems,
  type Comparison,
} from "@/lib/queries";
import { Icon } from "@/components/Icon";
import { ITEM_NOUN } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/staff";
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
  const isClothing = user.businessType === "ROPA";

  const [totals, topItems, staffTotals, clothing, comparison] = await Promise.all([
    getRangeTotals(user.id, safeFrom, to),
    getTopItems(user.id, safeFrom, to, 10),
    getStaffTotals(user.id, safeFrom, to),
    isClothing ? getClothingStats(user.id, safeFrom, to) : Promise.resolve(null),
    getComparison(user.id, safeFrom, to),
  ]);

  const exportar = "?from=" + safeFrom + "&to=" + to;

  // Solo tiene sentido comparar cuando hay mas de una persona vendiendo.
  const staffRows = staffTotals.rows.filter((r) => r.active || r.totalSales > 0 || r.booked > 0);
  const showStaff = (isBarber || isClothing) && staffRows.length > 1;
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
      <PageHeader title="Reportes" subtitle={"Del " + shortDay(safeFrom) + " al " + shortDay(to)}>
        {/* Descargas para el contador, con el mismo rango que estas mirando. */}
        <div className="flex flex-wrap gap-2">
          <a href={"/panel/exportar/ventas" + exportar} className="btn-ghost btn-sm">
            <Icon name="download" className="h-4 w-4" />
            Ventas
          </a>
          <a href={"/panel/exportar/gastos" + exportar} className="btn-ghost btn-sm">
            <Icon name="download" className="h-4 w-4" />
            Gastos
          </a>
          {isClothing && (
            <>
              <a href="/panel/exportar/inventario" className="btn-ghost btn-sm">
                <Icon name="download" className="h-4 w-4" />
                Inventario
              </a>
              <a href={"/panel/exportar/movimientos" + exportar} className="btn-ghost btn-sm">
                <Icon name="download" className="h-4 w-4" />
                Movimientos
              </a>
            </>
          )}
        </div>
      </PageHeader>

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

      <div className="mt-5">
        <Comparativa comparison={comparison} currency={user.currency} />
      </div>

      {showStaff && (
        <div className="mt-5">
          <Card
            title={isClothing ? "Medicion por empleado" : "Medicion por barbero"}
            subtitle={
              isClothing
                ? "Cuanto vendio cada uno en este periodo y que comision le queda"
                : "Cuanto atendio y cuanto entro por cada uno en este periodo"
            }
          >
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{isClothing ? "Empleado" : "Barbero"}</th>
                    {!isClothing && (
                      <>
                        <th className="text-right">Turnos</th>
                        <th className="text-right">Atendidos</th>
                        <th className="text-right">No asistio</th>
                      </>
                    )}
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
                              {ROLE_LABEL[row.role] ?? "Empleado"}
                              {row.active ? "" : " - inactivo"}
                            </span>
                          </span>
                        </span>
                      </td>
                      {!isClothing && (
                        <>
                          <td className="text-right">{row.booked}</td>
                          <td className="text-right">{row.attended}</td>
                          <td className="text-right">{row.noShow}</td>
                        </>
                      )}
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
                {staffTotals.unassigned.salesCount} ventas quedaron sin{" "}
                {isClothing ? "empleado" : "barbero"} asignado. Al registrar una venta, elige quien
                la hizo para que la medicion cuadre.
              </p>
            )}
          </Card>
        </div>
      )}

      {clothing && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Facturado"
              value={money(clothing.revenue, user.currency)}
              hint={clothing.unitsSold + " prendas vendidas"}
              tone="brand"
            />
            <Stat
              label="Costo de la mercancia"
              value={money(clothing.cost, user.currency)}
              hint="Lo que te costo lo vendido"
              tone="bad"
            />
            <Stat
              label="Utilidad bruta"
              value={money(clothing.grossProfit, user.currency)}
              hint={"Margen del " + clothing.marginPct + "%"}
              tone={clothing.grossProfit >= 0 ? "good" : "bad"}
            />
            <Stat
              label="Precio promedio"
              value={money(
                clothing.unitsSold ? Math.round(clothing.revenue / clothing.unitsSold) : 0,
                user.currency
              )}
              hint="Por prenda vendida"
            />
          </div>

          {clothing.withoutCost > 0 && (
            <p className="rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">
              {clothing.withoutCost} prendas vendidas no tienen costo cargado, asi que la utilidad
              sale mas alta de lo real. Ponle el costo a cada talla desde Inventario.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Tallas que mas salen" subtitle="Para saber que reponer primero">
              {clothing.topSizes.length === 0 ? (
                <Empty title="Aun no hay prendas vendidas por talla" />
              ) : (
                <ul className="space-y-2">
                  {clothing.topSizes.map((row) => {
                    const max = clothing.topSizes[0].qty || 1;
                    return (
                      <li key={row.label}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-body">{row.label}</span>
                          <span className="text-muted">{row.qty} vendidas</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-panel">
                          <div
                            className="h-full rounded-full bg-brand-600"
                            style={{ width: (row.qty / max) * 100 + "%" }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Categorias que mas facturan" subtitle="En que se te va y de que vives">
              {clothing.topCategories.length === 0 ? (
                <Empty title="Aun no hay ventas en este periodo" />
              ) : (
                <ul className="divide-y divide-line">
                  {clothing.topCategories.map((row) => (
                    <li key={row.name} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-strong">{row.name}</p>
                        <p className="text-[11px] text-subtle">{row.qty} prendas</p>
                      </div>
                      <span className="text-sm font-bold text-brand-600">
                        {money(row.total, user.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
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

/**
 * Como vas contra el periodo anterior.
 *
 * Un total solo no dice nada. Lo que la persona quiere saber es si va mejor o
 * peor que la semana pasada, y eso se responde con una flecha y un porcentaje.
 */
function Comparativa({
  comparison,
  currency,
}: {
  comparison: Comparison;
  currency: string;
}) {
  const valor = (n: number, esPlata: boolean) => (esPlata ? money(n, currency) : String(n));
  const dias = comparison.days;

  return (
    <Card
      title="Como vas"
      subtitle={
        "Comparado con los " +
        dias +
        (dias === 1 ? " dia anterior" : " dias anteriores") +
        " (del " +
        shortDay(comparison.prevFrom) +
        " al " +
        shortDay(comparison.prevTo) +
        ")"
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {comparison.rows.map((row) => {
          const sinDatos = row.pct === null;
          const subio = (row.pct ?? 0) > 0;
          const igual = (row.pct ?? 0) === 0;
          const bien = igual ? null : subio === row.upIsGood;

          return (
            <div key={row.key} className="rounded-xl border-2 border-edge bg-surface p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                {row.label}
              </p>
              <p className="mt-2 font-display text-[22px] leading-none text-strong num">
                {valor(row.now, row.money)}
              </p>

              {sinDatos ? (
                <p className="mt-2 text-xs text-subtle">Sin datos del periodo anterior</p>
              ) : (
                <p
                  className={
                    "mt-2 flex items-center gap-1 text-xs font-bold " +
                    (bien === null ? "text-muted" : bien ? "text-good" : "text-bad")
                  }
                >
                  <span className={igual ? "" : subio ? "" : "inline-block rotate-90"}>
                    {igual ? "=" : subio ? "▲" : "▼"}
                  </span>
                  {igual ? "Igual que antes" : Math.abs(row.pct!) + "%"}
                </p>
              )}

              <p className="mt-1 text-[11px] text-subtle">
                Antes: {valor(row.before, row.money)}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
