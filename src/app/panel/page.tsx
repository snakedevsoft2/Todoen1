import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { getDaySummary } from "@/lib/queries";
import { money, pretty12h, prettyDay, shortDay } from "@/lib/format";
import { filtroDeSeguimientos } from "@/lib/crm-filas";
import { esEmpleadoDeAsistencia, esLavadorDeLavadero } from "@/lib/permisos";
import { esDueno } from "@/lib/permisos-empleado";
import { ResumenAsistencia } from "@/components/ResumenAsistencia";
import { BUSINESS_LABEL, ITEM_NOUN } from "@/lib/nav";
import { getInventorySummary, getLowStock } from "@/lib/inventory";
import { variantLabel } from "@/lib/variants";
import { tourSteps } from "@/lib/tour";
import { Badge, Card, Empty, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { GuiaInicial } from "@/components/GuiaInicial";
import { ESTADO_PENDIENTE_LABEL, repartoDelDia, vehiculosPendientes } from "@/lib/patio-turno";
import { Icon } from "@/components/Icon";
import { resumenParqueadero } from "@/lib/parqueadero";

export const dynamic = "force-dynamic";

export default async function PanelHomePage() {
  const { user, staff: me } = await requireSession();

  // El asistente de bienvenida va primero que el resumen: sin el, alguien
  // nuevo aterriza en un menu de trece botones sin saber cuales son suyos.
  // Tiene "Saltar por ahora" en todos los pasos, asi que no encierra a nadie.
  // El empleado del gestor de asistencia no tiene resumen del negocio: su
  // pantalla es Marcar.
  if (esEmpleadoDeAsistencia(user, me)) redirect("/panel/marcar");
  // El lavador tampoco tiene resumen del negocio: su pantalla es sus lavados.
  if (esLavadorDeLavadero(user, me)) redirect("/panel/mis-lavados");

  // El empleado no pasa por el asistente que arma el menu: ese lo arma el dueño.
  if (!me.onboardingDoneAt && me.role === "DUENO") redirect("/panel/bienvenida");

  // Donde nadie vende, el resumen es de personal y no de plata.
  if (user.businessType === "ASISTENCIA") return <ResumenAsistencia user={user} staff={me} />;

  const today = todayIn(user.timezone);
  const isBarber = user.businessType === "BARBERIA";
  const isClothing = user.businessType === "ROPA";
  const isLavadero = user.businessType === "LAVADERO";
  const isParqueadero = user.businessType === "PARQUEADERO";

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
    isBarber || isClothing || isLavadero || isParqueadero
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
      include: {
        items: { select: { name: true, qty: true } },
        staff: { select: { name: true, color: true } },
      },
    }),
    // Al dueño se le sigue mostrando aunque sea un cierre viejo de antes de
    // que cada quien tuviera el suyo (esos quedaron con staffId vacío).
    db.cashClosure.findFirst({
      where: {
        userId: user.id,
        day: today,
        ...(esDueno(me.role) ? { OR: [{ staffId: me.id }, { staffId: null }] } : { staffId: me.id }),
      },
    }),
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

  // Lavadero: de lo que entro hoy, cuanto es de los lavadores (su comision) y
  // cuanto del lavadero, como va cada lavador, y que carros siguen en el
  // patio sin entregar (tambien los que quedaron de dias anteriores).
  const [lavadoresTeam, reparto, pendientesPatio] = isLavadero
    ? await Promise.all([
        db.staff.findMany({
          where: { userId: user.id, active: true, role: "VENDEDOR" },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, color: true, commissionPct: true },
        }),
        repartoDelDia(user.id, today),
        vehiculosPendientes(user.id),
      ])
    : [[], null, []];
  const porLavador = lavadoresTeam.map((person) => {
    const suyo = reparto?.porLavador.get(person.id);
    return { ...person, count: suyo?.count ?? 0, total: suyo?.total ?? 0, comision: suyo?.comision ?? 0 };
  });
  const pendientesValor = pendientesPatio.reduce((sum, j) => sum + j.price, 0);
  const sinPagar = pendientesPatio.filter((j) => j.status === "POR_COBRAR").length;
  const lavadosHoy = reparto ? [...reparto.porLavador.values()].reduce((sum, f) => sum + f.count, 0) : 0;

  const resumenParqueo = isParqueadero || isLavadero ? await resumenParqueadero(user.id, today, user.timezone) : null;
  // El lavadero solo lo ve si de verdad guarda carros: al que no usa el
  // parqueadero no se le llena el resumen de ceros.
  const parqueo =
    resumenParqueo &&
    (isParqueadero ||
      resumenParqueo.adentro + resumenParqueo.entraronHoy + resumenParqueo.porCobrar + resumenParqueo.pagosHoy > 0)
      ? resumenParqueo
      : null;

  // Lo que hay que hacer hoy con los clientes. Sale solo si hay algo: quien no
  // usa el CRM no tiene por que ver un cuadro vacio.
  const deQuien = { userId: user.id, doneAt: null, dueDay: { lte: today }, ...filtroDeSeguimientos(me) };
  const [seguimientosHoy, cuantosSeguimientos] = await Promise.all([
    db.followUp.findMany({
      where: deQuien,
      orderBy: [{ dueDay: "asc" }, { dueTime: { sort: "asc", nulls: "last" } }],
      take: 5,
      select: { id: true, title: true, dueDay: true, dueTime: true, customer: { select: { id: true, name: true } } },
    }),
    db.followUp.count({ where: deQuien }),
  ]);

  return (
    <>
      {/* El instructivo va despues del asistente: primero se arma el menu, y
          solo entonces tiene sentido explicar apartado por apartado. */}
      {/* Al empleado se le da solo la guia de uso, sin asistente de menu. */}
      {(me.onboardingDoneAt || me.role !== "DUENO") && !me.tourDoneAt && (
        <GuiaInicial
          steps={tourSteps(user.businessType)}
          businessName={user.businessName}
          personName={me.name}
        />
      )}

      <PageHeader
        title="Resumen del día"
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
          ) : isLavadero ? (
            <Link href="/panel/patio" className="btn-primary btn-sm">
              <Icon name="car" className="h-4 w-4" />
              Ver patio
            </Link>
          ) : isParqueadero ? (
            <Link href="/panel/parqueadero" className="btn-primary btn-sm">
              <Icon name="car" className="h-4 w-4" />
              Ingresar vehículo
            </Link>
          ) : (
            <Link href="/panel/cuentas" className="btn-primary btn-sm">
              <Icon name="table" className="h-4 w-4" />
              Cuentas abiertas
            </Link>
          )}
          {isLavadero && (
            <Link href="/panel/patio/entrega" className="btn-ghost btn-sm">
              <Icon name="clock" className="h-4 w-4" />
              Entrega de turno
            </Link>
          )}
          <Link href="/panel/ventas" className="btn-ghost btn-sm">
            <Icon name="plus" className="h-4 w-4" />
            Registrar venta
          </Link>
        </div>
      </PageHeader>

      {cuantosSeguimientos > 0 && (
        <section data-seguimientos-hoy className="mb-4 rounded-2xl border border-warn-line bg-warn-soft p-4">
          <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold text-strong">
            <Icon name="bell" className="h-4 w-4 text-warn" />
            {cuantosSeguimientos === 1
              ? "1 seguimiento para hoy"
              : cuantosSeguimientos + " seguimientos para hoy"}
            <Link
              href="/panel/clientes/seguimientos"
              className="ml-auto text-[13px] font-semibold text-brand-700 hover:underline"
            >
              Ver todos
            </Link>
          </h2>
          <ul className="mt-2">
            {seguimientosHoy.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-2 border-t border-warn-line/60 py-2 text-sm first:border-0">
                <span className="font-semibold text-strong [overflow-wrap:anywhere]">{s.title}</span>
                {s.customer && (
                  <Link href={"/panel/clientes/" + s.customer.id} className="text-muted hover:underline">
                    {s.customer.name}
                  </Link>
                )}
                <span className={"ml-auto text-xs font-semibold " + (s.dueDay < today ? "text-bad" : "text-warn")}>
                  {s.dueDay < today
                    ? "Atrasado · " + shortDay(s.dueDay)
                    : s.dueTime
                      ? pretty12h(s.dueTime)
                      : "Hoy"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ventas del día" value={money(summary.totalSales, user.currency)} hint={summary.salesCount + " ventas cerradas"} tone="brand" />
        <Stat label="Gastos del día" value={money(summary.totalExpenses, user.currency)} hint="Lo que salió de caja" tone="bad" />
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
                : "Inventario al día"
            }
            tone={stock.lowCount + stock.outCount > 0 ? "amber" : "brand"}
          />
        ) : isLavadero ? (
          <Stat
            label="Carros pendientes"
            value={String(pendientesPatio.length)}
            hint={
              "Por cobrar " +
              money(pendientesValor, user.currency) +
              (sinPagar > 0 ? " · " + sinPagar + (sinPagar === 1 ? " pendiente" : " pendientes") + " sin pagar" : "")
            }
            tone={pendientesPatio.length > 0 ? "amber" : "brand"}
          />
        ) : parqueo ? (
          <Stat
            label="Vehículos adentro"
            value={String(parqueo.adentro)}
            hint={"Van debiendo " + money(parqueo.adentroValor, user.currency)}
            tone="brand"
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

      {parqueo && (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4" data-resumen-parqueadero>
          {isLavadero ? (
            <Stat
              label="Parqueos de hoy"
              value={String(parqueo.entraronHoy)}
              hint={parqueo.adentro + (parqueo.adentro === 1 ? " guardado ahora" : " guardados ahora")}
            />
          ) : (
            <Stat label="Entraron hoy" value={String(parqueo.entraronHoy)} />
          )}
          <Stat label="Salieron hoy" value={String(parqueo.salieronHoy)} />
          <Stat
            label="Pendientes por pagar"
            value={String(parqueo.porCobrar)}
            hint={money(parqueo.porCobrarValor, user.currency)}
            tone={parqueo.porCobrar > 0 ? "amber" : "default"}
          />
          <Stat
            label="Recaudado del parqueadero"
            value={money(parqueo.recaudadoHoy, user.currency)}
            hint={parqueo.pagosHoy + (parqueo.pagosHoy === 1 ? " salida cobrada" : " salidas cobradas")}
            tone="good"
          />
        </div>
      )}

      {isLavadero && reparto && (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4" data-reparto-lavadero>
          <Stat
            label="Ingreso del lavadero"
            value={money(reparto.lavadero, user.currency)}
            hint="Ventas menos comisiones"
            tone="good"
          />
          <Stat
            label="Para los lavadores"
            value={money(reparto.lavadores, user.currency)}
            hint="Su comisión de hoy"
          />
          <Stat
            label="Lavadero menos gastos"
            value={money(reparto.lavadero - summary.totalExpenses, user.currency)}
            hint="Lo que le queda limpio al negocio"
            tone={reparto.lavadero - summary.totalExpenses >= 0 ? "good" : "bad"}
          />
          <Stat
            label="Carros lavados hoy"
            value={String(lavadosHoy)}
            hint={pendientesPatio.length + " siguen en el patio"}
          />
        </div>
      )}

      {isLavadero && porLavador.length > 0 && (
        <Card className="mt-4" title="Tus lavadores" subtitle="Cuántos carros lleva cada uno hoy y cuánto gana">
          <ul className="space-y-2">
            {porLavador.map((person) => (
              <li key={person.id}>
                <Link
                  href={"/panel/patio/lavador/" + person.id}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition hover:bg-soft"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: person.color }}
                  >
                    {person.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-strong">{person.name}</p>
                    <p className="text-xs text-subtle">
                      {person.count === 0
                        ? "Aún no lava ningún carro hoy"
                        : person.count === 1
                          ? "1 carro lavado"
                          : person.count + " carros lavados"}
                      {person.commissionPct > 0 &&
                        " · gana " + money(person.comision, user.currency) + " (" + person.commissionPct + "%)"}
                    </p>
                  </div>
                  <span className="shrink-0 text-base font-bold text-good">
                    {money(person.total, user.currency)}
                  </span>
                  <Icon name="chevronDown" className="h-4 w-4 shrink-0 -rotate-90 text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
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
                title="Todavía no hay turnos para hoy"
                hint="Comparte tu enlace de reservas para que los clientes separen el cupo."
              />
            ) : (
              <ul className="space-y-2">
                {appointments.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5"
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
            subtitle="Tallas agotadas o por debajo del mínimo"
            action={
              <Link href="/panel/inventario" className="btn-ghost btn-sm">
                Abrir inventario
              </Link>
            }
          >
            {lowStock.length === 0 ? (
              <Empty
                title="Todo el inventario esta bien"
                hint="Ninguna talla llegó a su mínimo. Sigue vendiendo."
              />
            ) : (
              <ul className="space-y-2">
                {lowStock.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
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
        ) : isLavadero ? (
          <Card
            title="Carros pendientes"
            subtitle="Siguen en el patio sin entregar ni cobrar"
            action={
              <Link href="/panel/patio" className="btn-ghost btn-sm">
                Abrir patio
              </Link>
            }
          >
            {pendientesPatio.length === 0 ? (
              <Empty title="No hay carros pendientes" hint="Todo lo que entró ya se entregó." />
            ) : (
              <ul className="space-y-2" data-carros-pendientes>
                {pendientesPatio.map((j) => (
                  <li
                    key={j.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-strong">
                        {[j.vehiclePlate, j.vehicleType].filter(Boolean).join(" · ") || j.clientName}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {j.serviceName}
                        {j.assignedStaff ? " · con " + j.assignedStaff.name : " · sin lavador"}
                        {j.day < today ? " · desde el " + shortDay(j.day) : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={j.status === "POR_COBRAR" ? "red" : j.status === "LISTO" ? "blue" : "amber"}>
                        {ESTADO_PENDIENTE_LABEL[j.status] ?? j.status}
                      </Badge>
                      <span className="text-sm font-bold text-strong">{money(j.price, user.currency)}</span>
                    </div>
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
                        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition hover:bg-surface"
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
          title="Últimas ventas"
          subtitle={"Movimientos de " + ITEM_NOUN[user.businessType].plural}
          action={
            <Link href="/panel/ventas" className="btn-ghost btn-sm">
              Ver todas
            </Link>
          }
        >
          {recentSales.length === 0 ? (
            <Empty title="Aún no has cerrado ventas hoy" hint="Registra la primera venta del día." />
          ) : (
            <ul className="space-y-2">
              {recentSales.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-strong">
                      {s.items.map((i) => i.qty + "x " + i.name).join(", ") || "Venta"}
                    </p>
                    <p className="text-xs text-muted">
                      {s.clientName ?? "Mostrador"} - {s.paymentMethod.toLowerCase()}
                    </p>
                    {s.staff && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-subtle">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: s.staff.color }}
                        />
                        {s.staff.name}
                      </p>
                    )}
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
            <Empty title="Sin gastos anotados hoy" hint="Anota insumos, domicilios o compras del día." />
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
