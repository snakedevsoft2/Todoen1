import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayIn, timeIn, todayIn } from "@/lib/dates";
import { money, pretty12h, prettyDay, shortDay } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { EntregaTurnoForm } from "@/components/EntregaTurnoForm";
import { recibirEntregaAction } from "@/actions/lavadero";
import { esDueno, esSupervisor } from "@/lib/permisos-empleado";
import {
  ESTADO_PENDIENTE_LABEL,
  entregaPorRecibir,
  inicioDelTurno,
  resumenDelTurno,
  vehiculosPendientes,
  type PendienteEnEntrega,
} from "@/lib/patio-turno";

export const dynamic = "force-dynamic";

const ESTADO_LABEL = ESTADO_PENDIENTE_LABEL;

/**
 * El cierre del jefe de patio: lo que paso en su turno, lo que queda en el
 * patio, y la entrega al que sigue. Tambien es donde el que llega recibe.
 */
export default async function EntregaTurnoPage() {
  const { user, staff: me } = await requireSession();
  if (user.businessType !== "LAVADERO") redirect("/panel");
  if (!esDueno(me.role) && !esSupervisor(me.role)) redirect("/panel/mis-lavados");

  const today = todayIn(user.timezone);
  const since = await inicioDelTurno(user.id, today, user.timezone);

  const [resumen, pendientes, porRecibir, siguientes, historial] = await Promise.all([
    resumenDelTurno(user.id, since),
    vehiculosPendientes(user.id),
    entregaPorRecibir(user.id, me.id),
    db.staff.findMany({
      where: { userId: user.id, active: true, role: { in: ["SUPERVISOR", "DUENO"] }, NOT: { id: me.id } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    db.patioHandover.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        fromStaff: { select: { name: true } },
        toStaff: { select: { name: true } },
        receivedBy: { select: { name: true } },
      },
    }),
  ]);

  const hora = (d: Date) => pretty12h(timeIn(d, user.timezone));
  // Un turno de noche puede venir de ayer: ahi se dice de que dia.
  const cuando = (d: Date) => {
    const dia = dayIn(d, user.timezone);
    return hora(d) + (dia === today ? "" : " del " + shortDay(dia));
  };
  const m = (n: number) => money(n, user.currency);
  const pendienteValor = pendientes.reduce((sum, j) => sum + j.price, 0);

  return (
    <>
      <PageHeader title="Entrega de turno" subtitle={prettyDay(today)}>
        <Link href="/panel/patio" className="btn-ghost btn-sm">
          Volver al patio
        </Link>
      </PageHeader>

      {porRecibir && (
        <Card
          className="mb-5 border-warn-line"
          title={(porRecibir.fromStaff?.name ?? "El jefe anterior") + " te entregó el patio"}
          subtitle={"A las " + hora(porRecibir.createdAt) + " del " + shortDay(porRecibir.day)}
        >
          <DetalleEntrega entrega={porRecibir} m={m} />
          <form action={recibirEntregaAction} className="mt-3">
            <input type="hidden" name="id" value={porRecibir.id} />
            <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="...">
              Recibí el patio así
            </SubmitButton>
          </form>
        </Card>
      )}

      <Card title="Tu turno" subtitle={"Desde las " + cuando(since) + " hasta ahora"}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Carros entregados" value={String(resumen.vehiclesDelivered)} />
          <Stat label="Cobrado" value={m(resumen.reparto.total)} hint={resumen.salesCount + " ventas"} tone="good" />
          <Stat label="Para el lavadero" value={m(resumen.reparto.lavadero)} hint="Cobrado menos comisiones" tone="good" />
          <Stat label="Para los lavadores" value={m(resumen.reparto.lavadores)} hint="Su comisión" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Efectivo" value={m(resumen.byMethod.EFECTIVO)} />
          <Stat label="Tarjeta" value={m(resumen.byMethod.TARJETA)} />
          <Stat label="Transferencia" value={m(resumen.byMethod.TRANSFERENCIA)} />
          <Stat label="Gastos" value={m(resumen.totalExpenses)} tone="bad" />
        </div>
        <p className="mt-3 text-sm text-muted">
          Efectivo que debería quedar en caja: <strong className="text-strong">{m(resumen.expectedCash)}</strong>{" "}
          (efectivo cobrado menos gastos).
        </p>
      </Card>

      <Card
        className="mt-4"
        title={"Vehículos pendientes · " + pendientes.length}
        subtitle={
          pendientes.length === 0
            ? "El patio queda limpio"
            : "Quedan en el patio para el que llega · por cobrar " + m(pendienteValor)
        }
      >
        {pendientes.length === 0 ? (
          <Empty title="No queda ningún vehículo pendiente" />
        ) : (
          <ListaPendientes
            items={pendientes.map((j) => ({
              id: j.id,
              day: j.day,
              clientName: j.clientName,
              vehiclePlate: j.vehiclePlate,
              vehicleType: j.vehicleType,
              serviceName: j.serviceName,
              price: j.price,
              status: j.status,
              lavador: j.assignedStaff?.name ?? null,
            }))}
            today={today}
            m={m}
          />
        )}
      </Card>

      <Card className="mt-4" title="Entregar el turno" subtitle="Queda guardado y el que llega lo confirma">
        <EntregaTurnoForm
          siguientes={siguientes}
          efectivoEsperado={m(resumen.expectedCash)}
          marcarSalida={!esDueno(me.role)}
        />
      </Card>

      <Card className="mt-4" title="Entregas anteriores">
        {historial.length === 0 ? (
          <Empty title="Todavía no hay entregas de turno" hint="La primera aparece aquí apenas alguien entregue." />
        ) : (
          <ul className="space-y-3">
            {historial.map((e) => (
              <li key={e.id} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-strong">
                      {(e.fromStaff?.name ?? "Alguien") + (e.toStaff ? " → " + e.toStaff.name : "")}
                    </p>
                    <p className="text-xs text-muted">
                      {shortDay(e.day)} · {hora(e.since)} a {hora(e.createdAt)}
                    </p>
                  </div>
                  {e.receivedAt ? (
                    <Badge tone="green">
                      Recibió {e.receivedBy?.name ?? ""} · {hora(e.receivedAt)}
                    </Badge>
                  ) : (
                    <Badge tone="amber">Sin recibir</Badge>
                  )}
                </div>
                <DetalleEntrega entrega={e} m={m} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function DetalleEntrega({
  entrega: e,
  m,
}: {
  entrega: {
    vehiclesDelivered: number;
    totalSales: number;
    totalCash: number;
    totalExpenses: number;
    totalCommissions: number;
    cashDelivered: number;
    pendingCount: number;
    pendingValue: number;
    pendingSnapshot: unknown;
    notes: string | null;
  };
  m: (n: number) => string;
}) {
  const esperado = e.totalCash - e.totalExpenses;
  const diferencia = e.cashDelivered - esperado;
  const pendientes = Array.isArray(e.pendingSnapshot) ? (e.pendingSnapshot as PendienteEnEntrega[]) : [];

  return (
    <div className="mt-2 space-y-2 text-xs text-muted">
      <p>
        {e.vehiclesDelivered === 1 ? "1 carro entregado" : e.vehiclesDelivered + " carros entregados"} · cobrado {m(e.totalSales)} · lavadero{" "}
        {m(e.totalSales - e.totalCommissions)} · lavadores {m(e.totalCommissions)}
      </p>
      <p>
        Efectivo dejado {m(e.cashDelivered)} de {m(esperado)} esperado
        {e.cashDelivered > 0 && diferencia !== 0 && (
          <span className={diferencia < 0 ? " font-semibold text-bad" : " font-semibold text-good"}>
            {" "}
            ({diferencia < 0 ? "faltan " : "sobran "}
            {m(Math.abs(diferencia))})
          </span>
        )}
      </p>
      <p>
        {e.pendingCount === 0
          ? "Sin vehículos pendientes."
          : (e.pendingCount === 1 ? "1 vehículo pendiente" : e.pendingCount + " vehículos pendientes") + " · por cobrar " + m(e.pendingValue)}
      </p>
      {pendientes.length > 0 && (
        <ul className="list-disc pl-4">
          {pendientes.map((p) => (
            <li key={p.id}>
              {[p.vehiclePlate, p.vehicleType].filter(Boolean).join(" ") || p.clientName} · {p.serviceName} ·{" "}
              {ESTADO_LABEL[p.status] ?? p.status}
              {p.lavador ? " con " + p.lavador : ""}
            </li>
          ))}
        </ul>
      )}
      {e.notes && <p className="whitespace-pre-line rounded-lg bg-soft p-2 text-body">{e.notes}</p>}
    </div>
  );
}

function ListaPendientes({
  items,
  today,
  m,
}: {
  items: PendienteEnEntrega[];
  today: string;
  m: (n: number) => string;
}) {
  return (
    <ul className="space-y-2">
      {items.map((p) => (
        <li
          key={p.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-strong">
              {[p.vehiclePlate, p.vehicleType].filter(Boolean).join(" · ") || p.clientName}
            </p>
            <p className="text-xs text-muted">
              {p.clientName} · {p.serviceName}
              {p.lavador ? " · con " + p.lavador : " · sin lavador"}
            </p>
            {p.day < today && <p className="text-[11px] font-semibold text-warn">Desde el {shortDay(p.day)}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone={p.status === "POR_COBRAR" ? "red" : p.status === "LISTO" ? "blue" : "amber"}>{ESTADO_LABEL[p.status] ?? p.status}</Badge>
            <span className="text-sm font-bold text-strong">{m(p.price)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
