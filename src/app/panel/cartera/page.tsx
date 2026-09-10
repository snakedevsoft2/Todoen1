import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { startOfMonth, todayIn } from "@/lib/dates";
import { money, prettyDay, shortDay } from "@/lib/format";
import { collectionMessage, debtState, saldo } from "@/lib/debts";
import { toInternational, waLink } from "@/lib/whatsapp";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { NewDebtForm } from "@/components/DebtForms";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { markCollectedAction } from "@/actions/debts";

export const dynamic = "force-dynamic";

const FILTROS = [
  { key: "pendientes", label: "Por cobrar" },
  { key: "vencidas", label: "Vencidas" },
  { key: "pagadas", label: "Pagadas" },
  { key: "todas", label: "Todas" },
];

export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const filtro = FILTROS.some((f) => f.key === params.f) ? params.f! : "pendientes";

  const hoy = todayIn(user.timezone);
  const mes = startOfMonth(hoy);

  const [deudas, cobradoMes] = await Promise.all([
    db.debt.findMany({
      where: { userId: user.id },
      orderBy: [{ status: "asc" }, { dueDay: "asc" }, { day: "asc" }],
      include: { payments: { orderBy: { day: "desc" } } },
    }),
    db.debtPayment.aggregate({
      where: { userId: user.id, day: { gte: mes, lte: hoy } },
      _sum: { amount: true },
    }),
  ]);

  const conEstado = deudas.map((d) => ({
    deuda: d,
    pendiente: saldo(d),
    estado: debtState(d, hoy),
  }));

  const porCobrar = conEstado.filter((r) => r.deuda.status === "PENDIENTE" && r.pendiente > 0);
  const vencidas = porCobrar.filter((r) => r.estado.key === "vencida");
  const totalPorCobrar = porCobrar.reduce((s, r) => s + r.pendiente, 0);
  const totalVencido = vencidas.reduce((s, r) => s + r.pendiente, 0);

  const visibles =
    filtro === "pendientes"
      ? porCobrar
      : filtro === "vencidas"
        ? vencidas
        : filtro === "pagadas"
          ? conEstado.filter((r) => r.estado.key === "pagada")
          : conEstado;

  return (
    <>
      <PageHeader title="Cartera" subtitle="Quien te debe, cuanto y desde cuando" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Por cobrar"
          value={money(totalPorCobrar, user.currency)}
          hint={porCobrar.length + (porCobrar.length === 1 ? " deuda" : " deudas")}
          tone={totalPorCobrar > 0 ? "amber" : "good"}
        />
        <Stat
          label="Vencido"
          value={money(totalVencido, user.currency)}
          hint={vencidas.length + (vencidas.length === 1 ? " deuda" : " deudas")}
          tone={totalVencido > 0 ? "bad" : "good"}
        />
        <Stat
          label="Cobrado este mes"
          value={money(cobradoMes._sum.amount ?? 0, user.currency)}
          hint={"Desde el " + shortDay(mes)}
          tone="good"
        />
        <Stat
          label="Deuda promedio"
          value={money(
            porCobrar.length ? Math.round(totalPorCobrar / porCobrar.length) : 0,
            user.currency
          )}
          hint="Por cliente que debe"
        />
      </div>

      {vencidas.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bad-soft px-4 py-3 text-sm text-bad">
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          <span>
            Tienes {vencidas.length} {vencidas.length === 1 ? "deuda vencida" : "deudas vencidas"}{" "}
            por {money(totalVencido, user.currency)}.
          </span>
          <Link href="/panel/cartera?f=vencidas" className="link ml-auto">
            Ver cuales
          </Link>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <Link
                key={f.key}
                href={"/panel/cartera?f=" + f.key}
                className={filtro === f.key ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
              >
                {f.label}
              </Link>
            ))}
          </div>

          {visibles.length === 0 ? (
            <Card>
              <Empty
                title={
                  deudas.length === 0
                    ? "Nadie te debe nada"
                    : "No hay deudas en este filtro"
                }
                hint={
                  deudas.length === 0
                    ? "Cuando fies o quede un saldo pendiente, anotalo a la derecha."
                    : "Prueba con otro filtro."
                }
              />
            </Card>
          ) : (
            <ul className="space-y-3">
              {visibles.map(({ deuda, pendiente, estado }) => {
                const enlace = deuda.clientPhone
                  ? waLink(
                      toInternational(deuda.clientPhone, user.whatsappNumber),
                      collectionMessage({
                        businessName: user.businessName,
                        clientName: deuda.clientName,
                        concept: deuda.concept,
                        saldo: pendiente,
                        currency: user.currency,
                        estado,
                        prettyDue: deuda.dueDay ? prettyDay(deuda.dueDay) : null,
                      })
                    )
                  : null;

                return (
                  <li key={deuda.id} className="card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-display text-[16px] text-strong">
                          {deuda.clientName}
                          <Badge
                            tone={
                              estado.tone === "good"
                                ? "green"
                                : estado.tone === "bad"
                                  ? "red"
                                  : estado.tone === "amber"
                                    ? "amber"
                                    : "slate"
                            }
                          >
                            {estado.label}
                          </Badge>
                        </p>
                        <p className="mt-1 text-sm text-body">{deuda.concept}</p>
                        <p className="mt-1 text-xs text-subtle">
                          Debe desde el {shortDay(deuda.day)}
                          {deuda.dueDay ? " - vence el " + shortDay(deuda.dueDay) : ""}
                          {deuda.payments.length > 0
                            ? " - " + deuda.payments.length + " abonos"
                            : ""}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="stat-value text-strong">
                          {money(pendiente, user.currency)}
                        </p>
                        {pendiente !== deuda.amount && (
                          <p className="mt-1 text-[11px] text-subtle">
                            de {money(deuda.amount, user.currency)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                      <Link href={"/panel/cartera/" + deuda.id} className="btn-primary btn-sm">
                        Abrir
                      </Link>

                      {pendiente > 0 && enlace && (
                        <>
                          <a
                            href={enlace}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-success btn-sm"
                          >
                            <Icon name="whatsapp" className="h-4 w-4" />
                            Cobrar
                          </a>
                          <form action={markCollectedAction}>
                            <input type="hidden" name="id" value={deuda.id} />
                            <SubmitButton className="btn-ghost btn-sm" pendingText="...">
                              Ya le cobre
                            </SubmitButton>
                          </form>
                        </>
                      )}

                      {pendiente > 0 && !deuda.clientPhone && (
                        <span className="self-center text-xs text-subtle">
                          Sin WhatsApp no se le puede cobrar por chat
                        </span>
                      )}

                      {deuda.lastReminderAt && (
                        <span className="self-center text-[11px] text-subtle">
                          Ultimo cobro: {shortDay(deuda.lastReminderAt.toISOString().slice(0, 10))}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Anotar una deuda" subtitle="Lo que quedo debiendo un cliente">
            <NewDebtForm today={hoy} currency={user.currency} />
          </Card>

          <Card title="Como funciona la plata">
            <ul className="space-y-2.5 text-sm text-body">
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Si <strong>no</strong> registraste la venta cuando fiaste, cada abono entra como
                venta del dia en que lo recibes.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Si <strong>si</strong> la registraste, los abonos solo bajan el saldo. Asi no
                cuentas la misma plata dos veces.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Cada abono genera un comprobante que le puedes mandar al cliente.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
