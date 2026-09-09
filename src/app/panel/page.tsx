import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { getDaySummary } from "@/lib/queries";
import { money, pretty12h, prettyDay } from "@/lib/format";
import { BUSINESS_LABEL, ITEM_NOUN } from "@/lib/nav";
import { getInventorySummary, getLowStock } from "@/lib/inventory";
import { variantLabel } from "@/lib/variants";
import { tourSteps } from "@/lib/tour";
import { Badge, Card, Empty, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { GuiaInicial } from "@/components/GuiaInicial";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function PanelHomePage() {
  const { user, staff: me } = await requireSession();

  // El asistente de bienvenida va primero que el resumen: sin el, alguien
  // nuevo aterriza en un menu de trece botones sin saber cuales son suyos.
  // Tiene "Saltar por ahora" en todos los pasos, asi que no encierra a nadie.
  if (!me.onboardingDoneAt) redirect("/panel/bienvenida");

  const today = todayIn(user.timezone);
  const isBarber = user.businessType === "BARBERIA";
  const isClothing = user.businessType === "ROPA";

  const [summary, appointments, openOrders, recentSales, closure, expenses, stock, lowStock] =
    await Promise.all([
    getDaySummary(user.id, today),
    isBarber
      ? db.appointment.findMany({
          where: { userId: user.id, day: today },
          orderBy: { startTime: "asc" },
          include: {
            sale: { select: { id: true, total: true } },
            staff: { select: { id: true, name: true, color: true } },
          },
        })
      : Promise.resolve([]),
    isBarber || isClothing
      ? Promise.resolve([])
      : db.order.findMany({
          where: { userId: user.id, status: "ABIERTA" },
          orderBy: { createdAt: "asc" },
          include: { items: true },
        }),
    db.sale.findMany({
      where: { userId: user.id, day: today },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { items: { select: { name: true, qty: true } } },
    }),
    db.cashClosure.findUnique({ where: { userId_day: { userId: user.id, day: today } } }),
    db.expense.findMany({ where: { userId: user.id, day: today }, orderBy: { createdAt: "desc" }, take: 5 }),
    isClothing ? getInventorySummary(user.id) : Promise.resolve(null),
    isClothing ? getLowStock(user.id, 8) : Promise.resolve([]),
  ]);

  const pending = appointments.filter((a) => a.status === "PENDIENTE" || a.status === "CONFIRMADO");
  const attended = appointments.filter((a) => a.status === "ATENDIDO");

  // Como va cada barbero hoy.
  const team = isBarber
    ? await db.staff.findMany({
        where: { userId: user.id, active: true },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, color: true },
      })
    : [];
  const porBarbero = team.map((person) => {
    const suyos = appointments.filter((a) => a.staffId === person.id && a.status !== "CANCELADO");
    return {
      ...person,
      total: suyos.length,
      attended: suyos.filter((a) => a.status === "ATENDIDO").length,
      collected: suyos
        .filter((a) => a.status === "ATENDIDO")
        .reduce((sum, a) => sum + (a.sale?.total ?? 0), 0),
    };
  });
  const openTotal = openOrders.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
    0
  );

  return (
    <>
      {/* El instructivo va despues del asistente: primero se arma el menu, y
          solo entonces tiene sentido explicar apartado por apartado. */}
      {me.onboardingDoneAt && !me.tourDoneAt && (
        <GuiaInicial
          steps={tourSteps(user.businessType)}
          businessName={user.businessName}
          personName={me.name}
        />
      )}

      <PageHeader
        title="Resumen del dia"
        subtitle={prettyDay(today) + " - " + BUSINESS_LABEL[user.businessType]}
      >
        <div className="flex gap-2">
          {isBarber ? (
            <Link href="/panel/turnos" className="btn-primary btn-sm">
              <Icon name="calendar" className="h-4 w-4" />
              Ver turnos
            </Link>
          ) : isClothing ? (
            <Link href="/panel/inventario" className="btn-primary btn-sm">
              <Icon name="box" className="h-4 w-4" />
              Ver inventario
            </Link>
          ) : (
            <Link href="/panel/cuentas" className="btn-primary btn-sm">
              <Icon name="table" className="h-4 w-4" />
              Cuentas abiertas
            </Link>
          )}
          <Link href="/panel/ventas" className="btn-ghost btn-sm">
            <Icon name="plus" className="h-4 w-4" />
            Registrar venta
          </Link>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ventas del dia" value={money(summary.totalSales, user.currency)} hint={summary.salesCount + " ventas cerradas"} tone="brand" />
        <Stat label="Gastos del dia" value={money(summary.totalExpenses, user.currency)} hint="Lo que salio de caja" tone="bad" />
        <Stat
          label="Te queda limpio"
          value={money(summary.netTotal, user.currency)}
          hint="Ventas menos gastos"
          tone={summary.netTotal >= 0 ? "good" : "bad"}
        />
        <Stat
          label={isBarber ? "Cortes cobrados" : isClothing ? "Prendas vendidas" : "Items vendidos"}
          value={String(summary.itemsSold)}
          hint={
            isBarber
              ? attended.length + " turnos atendidos"
              : "Ticket promedio " + money(summary.ticketAverage, user.currency)
          }
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Efectivo" value={money(summary.byMethod.EFECTIVO, user.currency)} />
        <Stat label="Tarjeta" value={money(summary.byMethod.TARJETA, user.currency)} />
        <Stat label="Transferencia" value={money(summary.byMethod.TRANSFERENCIA, user.currency)} />
        {isClothing && stock ? (
          <Stat
            label="Prendas en tienda"
            value={String(stock.units)}
            hint={
              stock.lowCount + stock.outCount > 0
                ? stock.lowCount + stock.outCount + " tallas en rojo"
                : "Inventario al dia"
            }
            tone={stock.lowCount + stock.outCount > 0 ? "amber" : "brand"}
          />
        ) : (
          <Stat
            label={isBarber ? "Turnos separados hoy" : "Cuentas abiertas"}
            value={String(isBarber ? appointments.length : openOrders.length)}
            hint={
              isBarber ? pending.length + " por atender" : "Sin cobrar " + money(openTotal, user.currency)
            }
            tone="brand"
          />
        )}
      </div>

      {porBarbero.length > 1 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {porBarbero.map((person) => (
            <div key={person.id} className="card-tight flex items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: person.color }}
              >
                {person.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-strong">
                  {person.name}
                  {person.id === me.id && (
                    <span className="ml-1 text-[11px] font-normal text-brand-600">(tu)</span>
                  )}
                </p>
                <p className="text-[11px] text-subtle">
                  {person.total} turnos hoy - {person.attended} atendidos
                </p>
              </div>
              <p className="text-sm font-bold text-good">{money(person.collected, user.currency)}</p>
            </div>
          ))}
        </div>
      )}

      {closure && (
        <div className="mt-4 rounded-xl border border-good-line bg-good-soft px-4 py-3 text-sm text-good">
          La caja de hoy ya esta cerrada. Neto guardado: {money(closure.netTotal, user.currency)}.{" "}
          <Link href="/panel/caja" className="link">
            Ver el cierre
          </Link>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {isBarber ? (
          <Card
            title="Turnos de hoy"
            subtitle={"Hora, cliente y que se va a hacer"}
            action={
              <Link href="/panel/turnos" className="btn-ghost btn-sm">
                Abrir agenda
              </Link>
            }
          >
            {appointments.length === 0 ? (
              <Empty
                title="Todavia no hay turnos para hoy"
                hint="Comparte tu enlace de reservas para que los clientes separen el cupo."
              />
            ) : (
              <ul className="space-y-2">
                {appointments.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-edge bg-surface px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold text-strong">
                        <Icon name="clock" className="h-4 w-4 text-brand-600" />
                        {pretty12h(a.startTime)}
                        <span className="truncate font-normal text-body">{a.clientName}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {a.serviceName} - {money(a.price, user.currency)}
                      </p>
                      {a.staffName && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-subtle">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: a.staff?.color ?? "#94a3b8" }}
                          />
                          Atiende {a.staffName}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : isClothing ? (
          <Card
            title="Se te esta acabando"
            subtitle="Tallas agotadas o por debajo del minimo"
            action={
              <Link href="/panel/inventario" className="btn-ghost btn-sm">
                Abrir inventario
              </Link>
            }
          >
            {lowStock.length === 0 ? (
              <Empty
                title="Todo el inventario esta bien"
                hint="Ninguna talla llego a su minimo. Sigue vendiendo."
              />
            ) : (
              <ul className="space-y-2">
                {lowStock.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-xl border-2 border-edge bg-surface px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-strong">
                        {v.service.name}
                      </p>
                      <p className="text-xs text-muted">
                        {variantLabel(v)} - minimo {v.minStock}
                      </p>
                    </div>
                    <Badge tone={v.stock <= 0 ? "red" : "amber"}>
                      {v.stock <= 0 ? "Agotada" : "Quedan " + v.stock}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card
            title="Cuentas abiertas"
            subtitle="Mesas y pedidos sin cobrar"
            action={
              <Link href="/panel/cuentas" className="btn-ghost btn-sm">
                Abrir cuentas
              </Link>
            }
          >
            {openOrders.length === 0 ? (
              <Empty title="No hay cuentas abiertas" hint="Abre una cuenta cuando llegue un cliente." />
            ) : (
              <ul className="space-y-2">
                {openOrders.map((o) => {
                  const total = o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
                  return (
                    <li key={o.id}>
                      <Link
                        href={"/panel/cuentas/" + o.id}
                        className="flex items-center justify-between gap-3 rounded-xl border-2 border-edge bg-surface px-3 py-2.5 transition hover:bg-surface"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-strong">{o.label}</p>
                          <p className="text-xs text-muted">
                            {o.items.reduce((s, i) => s + i.qty, 0)} items
                          </p>
                        </div>
                        <span className="text-sm font-bold text-brand-600">
                          {money(total, user.currency)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        <Card
          title="Ultimas ventas"
          subtitle={"Movimientos de " + ITEM_NOUN[user.businessType].plural}
          action={
            <Link href="/panel/ventas" className="btn-ghost btn-sm">
              Ver todas
            </Link>
          }
        >
          {recentSales.length === 0 ? (
            <Empty title="Aun no has cerrado ventas hoy" hint="Registra la primera venta del dia." />
          ) : (
            <ul className="space-y-2">
              {recentSales.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border-2 border-edge bg-surface px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-strong">
                      {s.items.map((i) => i.qty + "x " + i.name).join(", ") || "Venta"}
                    </p>
                    <p className="text-xs text-muted">
                      {s.clientName ?? "Mostrador"} - {s.paymentMethod.toLowerCase()}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-good">
                    {money(s.total, user.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card
          title="Gastos de hoy"
          action={
            <Link href="/panel/gastos" className="btn-ghost btn-sm">
              Anotar gasto
            </Link>
          }
        >
          {expenses.length === 0 ? (
            <Empty title="Sin gastos anotados hoy" hint="Anota insumos, domicilios o compras del dia." />
          ) : (
            <ul className="divide-y divide-line">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-body">{e.description}</p>
                    <p className="text-xs text-subtle">{e.category}</p>
                  </div>
                  <span className="text-sm font-semibold text-bad">
                    -{money(e.amount, user.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
