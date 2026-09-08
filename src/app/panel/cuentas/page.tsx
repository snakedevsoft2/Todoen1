import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { money, prettyDay } from "@/lib/format";
import { Card, Empty, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { NewOrderForm } from "@/components/NewOrderForm";
import { SubmitButton } from "@/components/SubmitButton";
import { cancelOrderAction, deleteOrderAction } from "@/actions/orders";

export const dynamic = "force-dynamic";

export default async function CuentasPage() {
  const user = await requireUser();
  if (user.businessType === "BARBERIA") redirect("/panel");

  const today = todayIn(user.timezone);

  const [openOrders, closedToday, catalogCount] = await Promise.all([
    db.order.findMany({
      where: { userId: user.id, status: "ABIERTA" },
      orderBy: { createdAt: "asc" },
      include: { items: true },
    }),
    db.order.findMany({
      where: { userId: user.id, day: today, status: { not: "ABIERTA" } },
      orderBy: { updatedAt: "desc" },
      include: { sale: { select: { total: true, paymentMethod: true } }, items: true },
    }),
    db.service.count({ where: { userId: user.id, active: true } }),
  ]);

  const openTotal = openOrders.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
    0
  );
  const paidTotal = closedToday.reduce((sum, o) => sum + (o.sale?.total ?? 0), 0);
  const suggestion = "Mesa " + (openOrders.length + 1);

  return (
    <>
      <PageHeader title="Cuentas abiertas" subtitle={prettyDay(today)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cuentas abiertas" value={String(openOrders.length)} tone="brand" />
        <Stat label="Sin cobrar" value={money(openTotal, user.currency)} hint="Plata en mesa" tone="amber" />
        <Stat label="Cuentas cerradas hoy" value={String(closedToday.filter((o) => o.status === "PAGADA").length)} />
        <Stat label="Cobrado hoy en cuentas" value={money(paidTotal, user.currency)} tone="good" />
      </div>

      {catalogCount === 0 && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Todavia no tienes productos en tu catalogo.{" "}
          <Link href="/panel/catalogo" className="link">
            Agregalos aqui
          </Link>{" "}
          para cargar las cuentas mas rapido.
        </div>
      )}

      <div className="mt-5 space-y-4">
        <Card title="Abrir una cuenta nueva" subtitle="Una por mesa, domicilio o cliente">
          <NewOrderForm suggestion={suggestion} />
        </Card>

        <Card title="En curso" subtitle="Toca una cuenta para cargarle productos y cobrarla">
          {openOrders.length === 0 ? (
            <Empty title="No hay cuentas abiertas" hint="Abre la primera cuenta del dia arriba." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {openOrders.map((o) => {
                const total = o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
                const units = o.items.reduce((s, i) => s + i.qty, 0);
                return (
                  <li key={o.id} className="rounded-xl border border-line bg-ink/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-white">{o.label}</p>
                        <p className="text-xs text-slate-400">
                          {units} items{o.notes ? " - " + o.notes : ""}
                        </p>
                      </div>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-2 text-xl font-bold text-brand-300">
                      {money(total, user.currency)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={"/panel/cuentas/" + o.id} className="btn-primary btn-sm">
                        <Icon name="plus" className="h-4 w-4" />
                        Cargar y cobrar
                      </Link>
                      {units === 0 ? (
                        <form action={deleteOrderAction}>
                          <input type="hidden" name="orderId" value={o.id} />
                          <SubmitButton
                            className="btn-ghost btn-sm"
                            pendingText="..."
                            confirm="Borrar esta cuenta vacia"
                          >
                            Borrar
                          </SubmitButton>
                        </form>
                      ) : (
                        <form action={cancelOrderAction}>
                          <input type="hidden" name="orderId" value={o.id} />
                          <SubmitButton
                            className="btn-danger btn-sm"
                            pendingText="..."
                            confirm="Cancelar esta cuenta sin cobrarla"
                          >
                            Cancelar
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Cuentas cerradas hoy">
          {closedToday.length === 0 ? (
            <Empty title="Todavia no has cerrado cuentas hoy" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th>Items</th>
                    <th>Pago</th>
                    <th className="text-right">Total</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {closedToday.map((o) => (
                    <tr key={o.id}>
                      <td className="font-medium text-white">{o.label}</td>
                      <td>{o.items.reduce((s, i) => s + i.qty, 0)}</td>
                      <td className="capitalize">{o.sale?.paymentMethod.toLowerCase() ?? "-"}</td>
                      <td className="text-right font-semibold text-emerald-300">
                        {o.sale ? money(o.sale.total, user.currency) : "-"}
                      </td>
                      <td>
                        <StatusBadge status={o.status} />
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
