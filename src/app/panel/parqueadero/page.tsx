import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { money, prettyDay } from "@/lib/format";
import { esDueno } from "@/lib/permisos-empleado";
import { asegurarTarifas, resumenParqueadero, tarifaDelTicket, tarifasActivas } from "@/lib/parqueadero";
import { duracionTexto, minutosEntre, numeroTicket, normalizarPlaca } from "@/lib/parqueadero-tarifa";
import { fechaHora } from "@/lib/ticket-parqueadero";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { RefrescoAutomatico } from "@/components/RefrescoAutomatico";
import { IngresoVehiculoForm } from "@/components/parqueadero/IngresoVehiculoForm";
import { TiempoYCobro } from "@/components/parqueadero/TiempoYCobro";

export const dynamic = "force-dynamic";

/**
 * El parqueadero: ingresar vehiculos, ver los que estan adentro con su reloj
 * y lo que van debiendo, y los que salieron sin pagar.
 */
export default async function ParqueaderoPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user, staff: me } = await requireSession();
  if (user.businessType !== "PARQUEADERO") redirect("/panel");

  const { q } = await searchParams;
  const buscar = normalizarPlaca(q ?? "");
  const today = todayIn(user.timezone);
  await asegurarTarifas(user.id);

  const filtroPlaca = buscar ? { plate: { contains: buscar } } : {};
  const [tarifas, resumen, adentro, porCobrar, salidasHoy] = await Promise.all([
    tarifasActivas(user.id),
    resumenParqueadero(user.id, today, user.timezone),
    db.parkingTicket.findMany({
      where: { userId: user.id, status: "DENTRO", ...filtroPlaca },
      orderBy: { enteredAt: "asc" },
      take: 300,
    }),
    db.parkingTicket.findMany({
      where: { userId: user.id, status: "POR_COBRAR", ...filtroPlaca },
      orderBy: { exitedAt: "asc" },
      take: 100,
    }),
    db.parkingTicket.findMany({
      where: { userId: user.id, status: "PAGADO", sale: { day: today }, ...filtroPlaca },
      orderBy: { exitedAt: "desc" },
      take: 30,
    }),
  ]);

  const dueno = esDueno(me.role);

  return (
    <>
      <RefrescoAutomatico segundos={60} />
      <PageHeader title="Parqueadero" subtitle={prettyDay(today)}>
        <div className="flex flex-wrap gap-2">
          <Link href="/panel/parqueadero/historial" className="btn-ghost btn-sm">
            <Icon name="receipt" className="h-4 w-4" />
            Historial
          </Link>
          {dueno && (
            <Link href="/panel/parqueadero/tarifas" className="btn-ghost btn-sm">
              <Icon name="tag" className="h-4 w-4" />
              Tarifas
            </Link>
          )}
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-resumen-parqueadero>
        <Stat
          label="Adentro ahora"
          value={String(resumen.adentro)}
          hint={"Van debiendo " + money(resumen.adentroValor, user.currency)}
          tone="brand"
        />
        <Stat label="Entraron hoy" value={String(resumen.entraronHoy)} />
        <Stat label="Salieron hoy" value={String(resumen.salieronHoy)} />
        <Stat
          label="Pendientes por pagar"
          value={String(resumen.porCobrar)}
          hint={money(resumen.porCobrarValor, user.currency)}
          tone={resumen.porCobrar > 0 ? "amber" : "default"}
        />
        <Stat
          label="Recaudado hoy"
          value={money(resumen.recaudadoHoy, user.currency)}
          hint={resumen.pagosHoy + (resumen.pagosHoy === 1 ? " pago" : " pagos")}
          tone="good"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card title="Ingresar vehículo" subtitle="Solo la placa. Lo demás es opcional.">
          {tarifas.length === 0 ? (
            <Empty
              title="No tienes tarifas activas"
              hint={dueno ? "Crea o prende una en Tarifas para poder ingresar vehículos." : "Pídele al dueño que prenda una tarifa."}
            />
          ) : (
            <IngresoVehiculoForm
              tarifas={tarifas.map((t) => ({ id: t.id, name: t.name, pricePerHour: t.pricePerHour, pricePerDay: t.pricePerDay }))}
              currency={user.currency}
            />
          )}
        </Card>

        <div className="space-y-5">
          <form className="flex gap-2" role="search">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar placa"
              autoComplete="off"
              className="input uppercase"
              aria-label="Buscar placa"
            />
            <button className="btn-ghost btn-sm" type="submit">
              <Icon name="search" className="h-4 w-4" />
              Buscar
            </button>
            {buscar && (
              <Link href="/panel/parqueadero" className="btn-ghost btn-sm">
                Quitar
              </Link>
            )}
          </form>

          <Card title={"Adentro (" + adentro.length + ")"} subtitle="El reloj y lo que va debiendo cada uno">
            {adentro.length === 0 ? (
              <Empty title={buscar ? "Ninguna placa adentro coincide" : "No hay vehículos adentro"} />
            ) : (
              <ul className="divide-y divide-line" data-adentro>
                {adentro.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={"/panel/parqueadero/" + t.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 transition hover:bg-surface"
                    >
                      <span className="rounded-lg border border-line-strong bg-surface px-2 py-1 font-display text-sm tracking-widest text-strong">
                        {t.plate}
                      </span>
                      <span className="text-xs text-subtle">
                        {t.vehicleType} · #{numeroTicket(t.seq)} · entró {fechaHora(t.enteredAt.toISOString(), user.timezone)}
                        {t.spot ? " · " + t.spot : ""}
                      </span>
                      <span className="ml-auto">
                        <TiempoYCobro
                          enteredAt={t.enteredAt.toISOString()}
                          tarifa={tarifaDelTicket(t)}
                          currency={user.currency}
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {porCobrar.length > 0 && (
            <Card title={"Pendientes por pagar (" + porCobrar.length + ")"} subtitle="Salieron sin pagar">
              <ul className="divide-y divide-line" data-por-cobrar>
                {porCobrar.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={"/panel/parqueadero/" + t.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 transition hover:bg-surface"
                    >
                      <span className="rounded-lg border border-warn-line bg-warn-soft px-2 py-1 font-display text-sm tracking-widest text-strong">
                        {t.plate}
                      </span>
                      <span className="text-xs text-subtle">
                        #{numeroTicket(t.seq)} · salió {t.exitedAt ? fechaHora(t.exitedAt.toISOString(), user.timezone) : ""}
                        {t.phone ? " · " + t.phone : ""}
                      </span>
                      <b className="ml-auto text-sm text-warn">{money(t.amount ?? 0, user.currency)}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Salidas de hoy" subtitle="Los que ya pagaron">
            {salidasHoy.length === 0 ? (
              <Empty title="Todavía no ha salido nadie hoy" />
            ) : (
              <ul className="divide-y divide-line">
                {salidasHoy.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={"/panel/parqueadero/" + t.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 transition hover:bg-surface"
                    >
                      <span className="font-display text-sm tracking-widest text-strong">{t.plate}</span>
                      <span className="text-xs text-subtle">
                        {t.vehicleType} ·{" "}
                        {t.exitedAt ? duracionTexto(minutosEntre(t.enteredAt, t.exitedAt)) : ""}
                      </span>
                      <b className="ml-auto text-sm text-good">{money(t.amount ?? 0, user.currency)}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
