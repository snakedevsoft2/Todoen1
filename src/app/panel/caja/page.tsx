import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isValidDay, todayIn } from "@/lib/dates";
import { money, prettyDay, shortDay } from "@/lib/format";
import { getDaySummary } from "@/lib/queries";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { CashCloseForm } from "@/components/CashCloseForm";
import { SubmitButton } from "@/components/SubmitButton";
import { reopenCashAction } from "@/actions/cash";

export const dynamic = "force-dynamic";

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayIn(user.timezone);
  const day = params.d && isValidDay(params.d) ? params.d : today;

  const [summary, closure, history] = await Promise.all([
    getDaySummary(user.id, day),
    db.cashClosure.findUnique({ where: { userId_day: { userId: user.id, day } } }),
    db.cashClosure.findMany({ where: { userId: user.id }, orderBy: { day: "desc" }, take: 14 }),
  ]);

  const lastClosure = history.find((h) => h.day < day);
  const suggestedOpening = closure?.openingAmount ?? 0;
  const expectedCash =
    (closure?.openingAmount ?? 0) + summary.byMethod.EFECTIVO - summary.totalExpenses;

  return (
    <>
      <PageHeader title="Cierre de caja" subtitle={prettyDay(day)} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={"/panel/caja?d=" + addDays(day, -1)} className="btn-ghost btn-sm">
          Dia anterior
        </Link>
        <Link href="/panel/caja" className="btn-ghost btn-sm">
          Hoy
        </Link>
        <Link href={"/panel/caja?d=" + addDays(day, 1)} className="btn-ghost btn-sm">
          Dia siguiente
        </Link>
        <form className="ml-auto flex items-center gap-2" action="/panel/caja">
          <input className="input max-w-[170px] py-1.5 text-sm" type="date" name="d" defaultValue={day} />
          <button className="btn-ghost btn-sm" type="submit">
            Ir
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ventas del dia" value={money(summary.totalSales, user.currency)} tone="brand" />
        <Stat label="Gastos del dia" value={money(summary.totalExpenses, user.currency)} tone="bad" />
        <Stat
          label="Neto del dia"
          value={money(summary.netTotal, user.currency)}
          tone={summary.netTotal >= 0 ? "good" : "bad"}
        />
        <Stat label="Ventas cerradas" value={String(summary.salesCount)} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Efectivo" value={money(summary.byMethod.EFECTIVO, user.currency)} />
        <Stat label="Tarjeta" value={money(summary.byMethod.TARJETA, user.currency)} />
        <Stat label="Transferencia" value={money(summary.byMethod.TRANSFERENCIA, user.currency)} />
        <Stat label="Otros" value={money(summary.byMethod.OTRO, user.currency)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[440px_1fr]">
        <Card
          title={closure ? "Cierre guardado" : "Cerrar la caja"}
          subtitle={
            closure
              ? "Puedes actualizarlo o reabrirlo si te falto algo"
              : "Cuenta el efectivo y guarda el resultado del dia"
          }
        >
          {closure && (
            <div className="mb-4 space-y-2 rounded-xl border border-good-line bg-good-soft p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-good/80">Cerrado el</span>
                <span className="text-good">
                  {closure.closedAt.toLocaleString("es-CO", { timeZone: user.timezone })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-good/80">Neto guardado</span>
                <span className="font-bold text-good">
                  {money(closure.netTotal, user.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-good/80">Efectivo esperado</span>
                <span className="text-good">{money(expectedCash, user.currency)}</span>
              </div>
              {closure.countedCash > 0 && (
                <div className="flex justify-between">
                  <span className="text-good/80">Diferencia registrada</span>
                  <span
                    className={
                      closure.difference === 0
                        ? "text-good"
                        : closure.difference > 0
                          ? "text-good"
                          : "text-bad"
                    }
                  >
                    {closure.difference > 0 ? "+" : ""}
                    {money(closure.difference, user.currency)}
                  </span>
                </div>
              )}
              {closure.notes && <p className="text-xs italic text-good/70">{closure.notes}</p>}
              <form action={reopenCashAction} className="pt-1">
                <input type="hidden" name="day" value={day} />
                <SubmitButton
                  className="btn-ghost btn-sm w-full"
                  pendingText="..."
                  confirm="Reabrir la caja de este dia"
                >
                  Reabrir la caja
                </SubmitButton>
              </form>
            </div>
          )}

          <CashCloseForm
            day={day}
            cashSales={summary.byMethod.EFECTIVO}
            expenses={summary.totalExpenses}
            currency={user.currency}
            defaultOpening={suggestedOpening}
            alreadyClosed={Boolean(closure)}
          />

          {lastClosure && !closure && (
            <p className="mt-3 text-xs text-subtle">
              El ultimo cierre fue el {shortDay(lastClosure.day)} con un neto de{" "}
              {money(lastClosure.netTotal, user.currency)}.
            </p>
          )}
        </Card>

        <Card title="Cierres anteriores" subtitle="Los ultimos 14 dias cerrados">
          {history.length === 0 ? (
            <Empty
              title="Todavia no has cerrado ningun dia"
              hint="Cierra la caja al final de la jornada para tener el historial."
            />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th className="text-right">Ventas</th>
                    <th className="text-right">Gastos</th>
                    <th className="text-right">Neto</th>
                    <th className="text-right">Dif.</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <Link href={"/panel/caja?d=" + h.day} className="link">
                          {shortDay(h.day)}
                        </Link>
                      </td>
                      <td className="text-right">{money(h.totalSales, user.currency)}</td>
                      <td className="text-right text-bad">{money(h.totalExpenses, user.currency)}</td>
                      <td className="text-right font-semibold text-good">
                        {money(h.netTotal, user.currency)}
                      </td>
                      <td
                        className={
                          "text-right " +
                          (h.difference === 0
                            ? "text-muted"
                            : h.difference > 0
                              ? "text-good"
                              : "text-bad")
                        }
                      >
                        {h.difference === 0 ? "-" : money(h.difference, user.currency)}
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
