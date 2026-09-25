import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isValidDay, todayIn } from "@/lib/dates";
import { money, prettyDay, shortDay } from "@/lib/format";
import { getDaySummary } from "@/lib/queries";
import { esDueno } from "@/lib/permisos-empleado";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { CashCloseForm } from "@/components/CashCloseForm";
import { SubmitButton } from "@/components/SubmitButton";
import { reopenCashAction } from "@/actions/cash";
import { FormSinSenal } from "@/components/SinSenal";

export const dynamic = "force-dynamic";

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { user, staff: me } = await requireSession();
  const propias = esDueno(me.role);
  const params = await searchParams;
  const today = todayIn(user.timezone);
  const day = params.d && isValidDay(params.d) ? params.d : today;

  // El dueño ve y cierra el negocio completo, como siempre. Cada empleado con
  // cuenta separada ve y cierra solo lo suyo: cada quien tiene su propio
  // cierre del dia, sin pisarle el de nadie mas.
  // Los cierres de antes de que esto existiera no tienen staffId (no se sabe
  // quien cerro): al dueño se los seguimos mostrando como suyos, para que su
  // historial no desaparezca de la vista con esta migracion. Al empleado no:
  // el nunca tuvo cierre propio antes, asi que no hay nada suyo que rescatar.
  const propioOAntiguo = propias ? { OR: [{ staffId: me.id }, { staffId: null }] } : { staffId: me.id };

  const [summary, closure, history, equipoHoy] = await Promise.all([
    getDaySummary(user.id, day, propias ? undefined : me.id),
    db.cashClosure.findFirst({ where: { userId: user.id, day, ...propioOAntiguo } }),
    db.cashClosure.findMany({
      where: { userId: user.id, ...propioOAntiguo },
      orderBy: { day: "desc" },
      take: 14,
    }),
    // Solo el dueño ve como van los cierres del resto del equipo hoy.
    propias
      ? db.cashClosure.findMany({
          where: { userId: user.id, day, staffId: { not: me.id } },
          include: { staff: { select: { name: true, color: true } } },
          orderBy: { closedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const lastClosure = history.find((h) => h.day < day);
  const suggestedOpening = closure?.openingAmount ?? 0;
  const expectedCash =
    (closure?.openingAmount ?? 0) + summary.byMethod.EFECTIVO - summary.totalExpenses;

  return (
    <>
      <PageHeader
        title="Cierre de caja"
        subtitle={prettyDay(day) + (propias ? "" : " · Solo tus ventas, no las del negocio completo")}
      />

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
        <Stat label="Ventas del día" value={money(summary.totalSales, user.currency)} tone="brand" />
        <Stat label="Gastos del día" value={money(summary.totalExpenses, user.currency)} tone="bad" />
        <Stat
          label="Neto del día"
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
              : "Cuenta el efectivo y guarda el resultado del día"
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
              <FormSinSenal accion="reopenCashAction" servidor={reopenCashAction} className="pt-1">
                <input type="hidden" name="day" value={day} />
                <input type="hidden" name="staffId" value={me.id} />
                <SubmitButton
                  className="btn-ghost btn-sm w-full"
                  pendingText="..."
                  confirm="Reabrir la caja de este día"
                >
                  Reabrir la caja
                </SubmitButton>
              </FormSinSenal>
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

        <Card title="Cierres anteriores" subtitle="Los últimos 14 días cerrados">
          {history.length === 0 ? (
            <Empty
              title="Todavía no has cerrado ningún día"
              hint="Cierra la caja al final de la jornada para tener el historial."
            />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Día</th>
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

        {propias && (
          <Card title="Cierres del equipo hoy" subtitle="Cada quien cierra su propia caja">
            {equipoHoy.length === 0 ? (
              <Empty
                title="Nadie más ha cerrado hoy"
                hint="Cuando un empleado cierre su caja, aparece aquí."
              />
            ) : (
              <ul className="space-y-2">
                {equipoHoy.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: c.staff?.color ?? "#64748b" }}
                      />
                      <span className="text-sm font-semibold text-strong">
                        {c.staff?.name ?? "Ex empleado"}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-good">
                      {money(c.netTotal, user.currency)}
                    </span>
                    <span
                      className={
                        "text-xs " +
                        (c.difference === 0 ? "text-muted" : c.difference > 0 ? "text-good" : "text-bad")
                      }
                    >
                      {c.difference === 0 ? "Cuadró" : "Dif. " + money(c.difference, user.currency)}
                    </span>
                    <FormSinSenal accion="reopenCashAction" servidor={reopenCashAction}>
                      <input type="hidden" name="day" value={day} />
                      <input type="hidden" name="staffId" value={c.staffId ?? ""} />
                      <SubmitButton
                        className="btn-ghost btn-sm"
                        pendingText="..."
                        confirm={"Reabrir la caja de " + (c.staff?.name ?? "esta persona") + " de este día"}
                      >
                        Reabrir
                      </SubmitButton>
                    </FormSinSenal>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
