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
import { FormSinSenal } from "@/components/SinSenal";
import { ConfigurarMesasForm } from "@/components/ConfigurarMesasForm";
import { PisoDeMesas, type MesaPiso } from "@/components/PisoDeMesas";

export const dynamic = "force-dynamic";

/** Los negocios que reciben gente en mesas fisicas: ahi tiene sentido el piso con QR. */
const CON_MESAS: string[] = ["RESTAURANTE", "COMIDAS_RAPIDAS"];

export default async function CuentasPage() {
  const user = await requireUser();
  if (user.businessType === "BARBERIA") redirect("/panel");

  const today = todayIn(user.timezone);
  const conMesas = CON_MESAS.includes(user.businessType);

  const [openOrders, closedToday, catalogCount, tablas] = await Promise.all([
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
    conMesas
      ? db.table.findMany({
          where: { userId: user.id, active: true },
          orderBy: { number: "asc" },
          include: { orders: { where: { status: "ABIERTA" }, include: { items: true }, take: 1 } },
        })
      : Promise.resolve([]),
  ]);

  // Las cuentas de mesa ya se ven en el piso de mesas: en "En curso" solo van
  // las que no son de una mesa (domicilio, mostrador).
  const enCurso = conMesas ? openOrders.filter((o) => !o.tableId) : openOrders;
  const mesasPiso: MesaPiso[] = tablas.map((t) => {
    const orden = t.orders[0];
    return {
      id: t.id,
      number: t.number,
      qrToken: t.qrToken,
      orden: orden
        ? {
            id: orden.id,
            total: orden.items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
            items: orden.items.reduce((s, i) => s + i.qty, 0),
            hasNewFromCustomer: orden.hasNewFromCustomer,
          }
        : null,
    };
  });

  const openTotal = openOrders.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
    0
  );
  const paidTotal = closedToday.reduce((sum, o) => sum + (o.sale?.total ?? 0), 0);
  const suggestion = conMesas ? "Domicilio" : "Mesa " + (openOrders.length + 1);

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
        <div className="mt-4 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">
          Todavia no tienes productos en tu catalogo.{" "}
          <Link href="/panel/catalogo" className="link">
            Agregalos aqui
          </Link>{" "}
          para cargar las cuentas mas rapido.
        </div>
      )}

      <div className="mt-5 space-y-4">
        {conMesas && (
          <Card
            title="Tus mesas"
            subtitle="Toca una mesa para cargarle el pedido, o dale su QR para que pidan solos"
          >
            <div className="mb-4 border-b border-line pb-4">
              <ConfigurarMesasForm total={tablas.length} />
            </div>
            {tablas.length === 0 ? (
              <Empty title="Todavía no configuras tus mesas" hint="Escribe cuántas tienes arriba." />
            ) : (
              <PisoDeMesas mesas={mesasPiso} currency={user.currency} />
            )}
          </Card>
        )}

        <Card
          title={conMesas ? "Domicilios y otras cuentas" : "Abrir una cuenta nueva"}
          subtitle={conMesas ? "Lo que no es una mesa: domicilios, para llevar" : "Una por mesa, domicilio o cliente"}
        >
          <NewOrderForm suggestion={suggestion} />
        </Card>

        <Card
          title="En curso"
          subtitle={
            conMesas ? "Domicilios y otras cuentas que no son de una mesa" : "Toca una cuenta para cargarle productos y cobrarla"
          }
        >
          {enCurso.length === 0 ? (
            <Empty
              title={conMesas ? "No hay domicilios ni otras cuentas abiertas" : "No hay cuentas abiertas"}
              hint="Abre la primera cuenta del día arriba."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {enCurso.map((o) => {
                const total = o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
                const units = o.items.reduce((s, i) => s + i.qty, 0);
                return (
                  <li key={o.id} className="rounded-xl border border-line bg-surface p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-strong">{o.label}</p>
                        <p className="text-xs text-muted">
                          {units} items{o.notes ? " - " + o.notes : ""}
                        </p>
                      </div>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-2 text-xl font-bold text-brand-600">
                      {money(total, user.currency)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={"/panel/cuentas/" + o.id} className="btn-primary btn-sm">
                        <Icon name="plus" className="h-4 w-4" />
                        Cargar y cobrar
                      </Link>
                      {units === 0 ? (
                        <FormSinSenal accion="deleteOrderAction" servidor={deleteOrderAction}>
                          <input type="hidden" name="orderId" value={o.id} />
                          <SubmitButton
                            className="btn-ghost btn-sm"
                            pendingText="..."
                            confirm="Borrar esta cuenta vacía"
                          >
                            Borrar
                          </SubmitButton>
                        </FormSinSenal>
                      ) : (
                        <FormSinSenal accion="cancelOrderAction" servidor={cancelOrderAction}>
                          <input type="hidden" name="orderId" value={o.id} />
                          <SubmitButton
                            className="btn-danger btn-sm"
                            pendingText="..."
                            confirm="Cancelar esta cuenta sin cobrarla"
                          >
                            Cancelar
                          </SubmitButton>
                        </FormSinSenal>
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
            <Empty title="Todavía no has cerrado cuentas hoy" />
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
                      <td className="font-medium text-strong">{o.label}</td>
                      <td>{o.items.reduce((s, i) => s + i.qty, 0)}</td>
                      <td className="capitalize">{o.sale?.paymentMethod.toLowerCase() ?? "-"}</td>
                      <td className="text-right font-semibold text-good">
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
