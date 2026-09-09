import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { money, prettyDay, shortDay } from "@/lib/format";
import { logoUrl } from "@/lib/nav";
import { abonado, collectionMessage, debtState, saldo } from "@/lib/debts";
import { toInternational, waLink } from "@/lib/whatsapp";
import { PAYMENT_LABELS, Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { DueDayForm, PaymentForm } from "@/components/DebtForms";
import { ReceiptActions } from "@/components/ReceiptActions";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import {
  cancelDebtAction,
  deleteDebtAction,
  deletePaymentAction,
  markCollectedAction,
  reopenDebtAction,
} from "@/actions/debts";

export const dynamic = "force-dynamic";

export default async function DeudaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const deuda = await db.debt.findFirst({
    where: { id, userId: user.id },
    include: { payments: { orderBy: [{ day: "desc" }, { createdAt: "desc" }] } },
  });
  if (!deuda) notFound();

  const hoy = todayIn(user.timezone);
  const pendiente = saldo(deuda);
  const pagado = abonado(deuda);
  const estado = debtState(deuda, hoy);
  const logo = logoUrl(user.slug, user.logo, user.updatedAt);

  const enlaceCobro = deuda.clientPhone
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

  const anulada = deuda.status === "ANULADA";

  return (
    <>
      <PageHeader title={deuda.clientName} subtitle={deuda.concept}>
        <Link href="/panel/cartera" className="btn-ghost btn-sm">
          Volver a cartera
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Debe"
          value={money(pendiente, user.currency)}
          hint={estado.label}
          tone={pendiente === 0 ? "good" : estado.tone === "bad" ? "bad" : "amber"}
        />
        <Stat label="Deuda original" value={money(deuda.amount, user.currency)} />
        <Stat
          label="Abonado"
          value={money(pagado, user.currency)}
          hint={deuda.payments.length + (deuda.payments.length === 1 ? " abono" : " abonos")}
          tone="good"
        />
        <Stat
          label="Desde"
          value={shortDay(deuda.day)}
          hint={deuda.dueDay ? "Vence " + shortDay(deuda.dueDay) : "Sin fecha de vencimiento"}
        />
      </div>

      {anulada && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border-2 border-edge bg-surface px-4 py-3 text-sm text-muted">
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          <span>Esta deuda esta anulada. No cuenta en los totales de cartera.</span>
          <form action={reopenDebtAction} className="ml-auto">
            <input type="hidden" name="id" value={deuda.id} />
            <SubmitButton className="btn-ghost btn-sm" pendingText="...">
              Reactivar
            </SubmitButton>
          </form>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Card title="Historial de pagos" subtitle="Cada abono con su comprobante">
            {deuda.payments.length === 0 ? (
              <Empty
                title="Todavia no ha abonado nada"
                hint="Cuando te pague, registralo a la derecha."
              />
            ) : (
              <ul className="space-y-3">
                {deuda.payments.map((pago, i) => {
                  // El saldo que quedaba justo despues de este abono.
                  const posteriores = deuda.payments.slice(0, i);
                  const saldoTrasEste =
                    deuda.amount - (pagado - posteriores.reduce((s, p) => s + p.amount, 0));

                  return (
                    <li key={pago.id} className="rounded-xl border-2 border-edge bg-surface p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display text-[15px] text-strong num">
                            {money(pago.amount, user.currency)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {prettyDay(pago.day)} - {PAYMENT_LABELS[pago.method] ?? pago.method}
                            {pago.saleId ? " - sumado a la caja" : ""}
                          </p>
                          {pago.notes && (
                            <p className="mt-0.5 text-xs italic text-subtle">{pago.notes}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-subtle">Quedaba</p>
                          <p className="text-sm font-bold text-body num">
                            {money(Math.max(0, saldoTrasEste), user.currency)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t-2 border-line pt-3">
                        <ReceiptActions
                          clientPhone={deuda.clientPhone}
                          data={{
                            paymentId: pago.id,
                            businessName: user.businessName,
                            businessPhone: user.phone,
                            businessAddress: user.address,
                            logoUrl: logo,
                            currency: user.currency,
                            clientName: deuda.clientName,
                            concept: deuda.concept,
                            day: pago.day,
                            method: pago.method,
                            amount: pago.amount,
                            total: deuda.amount,
                            saldo: Math.max(0, saldoTrasEste),
                            historial: deuda.payments
                              .slice(i + 1)
                              .map((p) => ({ day: p.day, amount: p.amount })),
                          }}
                        />

                        <form action={deletePaymentAction}>
                          <input type="hidden" name="id" value={pago.id} />
                          <SubmitButton
                            className="btn-ghost btn-sm px-2 text-bad"
                            pendingText="..."
                            ariaLabel="Borrar abono"
                            confirm={
                              "Borrar este abono de " +
                              money(pago.amount, user.currency) +
                              (pago.saleId ? ". Tambien se borra de las ventas del dia." : "")
                            }
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </SubmitButton>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {deuda.notes && (
            <Card title="Nota">
              <p className="text-sm text-body">{deuda.notes}</p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {pendiente > 0 && !anulada && (
            <Card title="Registrar un abono" subtitle="Cuando el cliente te pague">
              <PaymentForm
                debtId={deuda.id}
                today={hoy}
                pendiente={pendiente}
                currency={user.currency}
                entraACaja={!deuda.alreadyInvoiced}
              />
            </Card>
          )}

          {pendiente > 0 && !anulada && (
            <Card title="Cobrarle" subtitle="El mensaje sale escrito segun como este la deuda">
              {enlaceCobro ? (
                <>
                  <a
                    href={enlaceCobro}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-success w-full justify-center"
                  >
                    <Icon name="whatsapp" className="h-5 w-5" />
                    Cobrar por WhatsApp
                  </a>
                  <form action={markCollectedAction} className="mt-2">
                    <input type="hidden" name="id" value={deuda.id} />
                    <SubmitButton className="btn-ghost btn-sm w-full" pendingText="...">
                      Marcar que ya le cobre
                    </SubmitButton>
                  </form>
                  {deuda.lastReminderAt && (
                    <p className="mt-2 text-xs text-subtle">
                      Ultimo cobro:{" "}
                      {prettyDay(deuda.lastReminderAt.toISOString().slice(0, 10))}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">
                  Esta deuda no tiene WhatsApp guardado. Anota el numero al crear la deuda para
                  poder cobrarle por chat.
                </p>
              )}
            </Card>
          )}

          {!anulada && (
            <Card title="Plazo">
              <DueDayForm debtId={deuda.id} dueDay={deuda.dueDay} />
            </Card>
          )}

          <Card title="Estado de la deuda">
            <div className="flex flex-wrap items-center gap-2">
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
              <span className="text-xs text-subtle">
                {deuda.alreadyInvoiced
                  ? "La venta ya estaba registrada"
                  : "Los abonos entran a la caja"}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t-2 border-edge pt-4">
              {!anulada && (
                <form action={cancelDebtAction}>
                  <input type="hidden" name="id" value={deuda.id} />
                  <SubmitButton
                    className="btn-ghost btn-sm"
                    pendingText="..."
                    confirm={
                      "Anular la deuda de " +
                      deuda.clientName +
                      ". Deja de contar en los totales, pero los abonos quedan."
                    }
                  >
                    Anular
                  </SubmitButton>
                </form>
              )}
              <form action={deleteDebtAction}>
                <input type="hidden" name="id" value={deuda.id} />
                <SubmitButton
                  className="btn-ghost btn-sm text-bad"
                  pendingText="..."
                  confirm={
                    deuda.payments.length > 0
                      ? "Esta deuda tiene abonos, asi que se anula en vez de borrarse."
                      : "Borrar la deuda de " + deuda.clientName + "."
                  }
                >
                  <Icon name="trash" className="h-4 w-4" />
                  Borrar
                </SubmitButton>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
