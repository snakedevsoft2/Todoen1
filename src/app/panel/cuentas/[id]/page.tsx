import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { Card, Empty, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import {
  addOrderItemAction,
  changeOrderItemQtyAction,
  closeOrderAction,
  removeOrderItemAction,
} from "@/actions/orders";

export const dynamic = "force-dynamic";

export default async function CuentaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (user.businessType === "BARBERIA") redirect("/panel");

  const { id } = await params;

  // El filtro por userId garantiza que nadie abra la cuenta de otro negocio.
  const order = await db.order.findFirst({
    where: { id, userId: user.id },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      sale: { select: { id: true, total: true, paymentMethod: true } },
    },
  });
  if (!order) notFound();

  const services = await db.service.findMany({
    where: { userId: user.id, active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const total = order.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const units = order.items.reduce((s, i) => s + i.qty, 0);
  const isOpen = order.status === "ABIERTA";

  const grouped = services.reduce<Record<string, typeof services>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <>
      <PageHeader title={order.label} subtitle={"Cuenta del " + order.day}>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} />
          <Link href="/panel/cuentas" className="btn-ghost btn-sm">
            Volver
          </Link>
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {isOpen && (
            <Card title="Agregar del catalogo" subtitle="Un toque agrega una unidad">
              {services.length === 0 ? (
                <Empty
                  title="Tu catalogo esta vacio"
                  hint="Crea tus platos o productos en la seccion de productos y servicios."
                />
              ) : (
                <div className="space-y-4">
                  {Object.entries(grouped).map(([category, list]) => (
                    <div key={category}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        {category}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {list.map((s) => (
                          <form key={s.id} action={addOrderItemAction}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="serviceId" value={s.id} />
                            <input type="hidden" name="qty" value="1" />
                            <SubmitButton
                              className="btn-ghost w-full flex-col items-start gap-0 px-3 py-2.5 text-left"
                              pendingText="Agregando..."
                            >
                              <span className="w-full truncate text-xs font-semibold text-strong">
                                {s.name}
                              </span>
                              <span className="text-[11px] text-brand-600">
                                {money(s.price, user.currency)}
                              </span>
                            </SubmitButton>
                          </form>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-brand-600">
                  Agregar algo que no esta en el catalogo
                </summary>
                <form action={addOrderItemAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_90px_auto]">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input className="input" name="name" placeholder="Nombre del item" required />
                  <input
                    className="input"
                    name="unitPrice"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Precio"
                    required
                  />
                  <input className="input" name="qty" type="number" min={1} defaultValue={1} />
                  <SubmitButton className="btn-primary" pendingText="...">
                    Agregar
                  </SubmitButton>
                </form>
              </details>
            </Card>
          )}

          <Card title="Detalle de la cuenta" subtitle={units + " items cargados"}>
            {order.items.length === 0 ? (
              <Empty title="La cuenta esta vacia" hint="Agrega productos del catalogo para cobrarla." />
            ) : (
              <ul className="divide-y divide-line">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-strong">{item.name}</p>
                      <p className="text-xs text-muted">
                        {money(item.unitPrice, user.currency)} por unidad
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOpen && (
                        <form action={changeOrderItemQtyAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="delta" value="-1" />
                          <SubmitButton className="btn-ghost btn-sm px-2.5" pendingText="...">
                            -
                          </SubmitButton>
                        </form>
                      )}
                      <span className="w-8 text-center text-sm font-bold text-strong">{item.qty}</span>
                      {isOpen && (
                        <form action={changeOrderItemQtyAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="delta" value="1" />
                          <SubmitButton className="btn-ghost btn-sm px-2.5" pendingText="...">
                            +
                          </SubmitButton>
                        </form>
                      )}
                      <span className="w-24 text-right text-sm font-bold text-brand-600">
                        {money(item.unitPrice * item.qty, user.currency)}
                      </span>
                      {isOpen && (
                        <form action={removeOrderItemAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <SubmitButton className="btn-ghost btn-sm px-2 text-bad" pendingText="...">
                            <Icon name="trash" className="h-4 w-4" />
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Total a cobrar">
            <p className="text-3xl font-bold text-strong">{money(total, user.currency)}</p>
            <p className="mt-1 text-xs text-muted">{units} items en la cuenta</p>

            {order.sale ? (
              <div className="mt-4 rounded-xl border border-good-line bg-good-soft p-3 text-sm text-good">
                Cuenta cobrada por {money(order.sale.total, user.currency)} en{" "}
                {order.sale.paymentMethod.toLowerCase()}. Ya quedo en las ventas del dia.
              </div>
            ) : isOpen ? (
              <form action={closeOrderAction} className="mt-4 space-y-3">
                <input type="hidden" name="orderId" value={order.id} />
                <label className="block">
                  <span className="label">Metodo de pago</span>
                  <select className="input" name="paymentMethod" defaultValue="EFECTIVO">
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TARJETA">Tarjeta</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Descuento (opcional)</span>
                  <input className="input" name="discount" type="number" min={0} step={1} placeholder="0" />
                </label>
                <SubmitButton
                  className="btn-success w-full"
                  pendingText="Cerrando cuenta..."
                  confirm={"Cerrar la cuenta " + order.label}
                >
                  <Icon name="check" className="h-4 w-4" />
                  Cerrar cuenta y cobrar
                </SubmitButton>
                {order.items.length === 0 && (
                  <p className="text-xs text-warn">
                    Agrega al menos un item antes de cerrar la cuenta.
                  </p>
                )}
              </form>
            ) : (
              <p className="mt-4 text-sm text-muted">Esta cuenta esta {order.status.toLowerCase()}.</p>
            )}
          </Card>

          {order.notes && (
            <Card title="Nota">
              <p className="text-sm text-body">{order.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
