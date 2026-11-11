import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { esDueno } from "@/lib/permisos-empleado";
import { db } from "@/lib/db";
import { addDays, isValidDay, todayIn } from "@/lib/dates";
import { money, prettyDay } from "@/lib/format";
import { esEmInversiones, opcionesPlanDe } from "@/lib/em-inversiones";
import { anteriorDiaDeCobro, porQueNoSeCobra, siguienteDiaDeCobro } from "@/lib/festivos";
import { filasDeCobro } from "@/lib/cobro-dia";
import { esPlanCompleto } from "@/lib/plan";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { ImprimirCobro } from "@/components/CobroDelDia";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

/**
 * El cobro de un dia, para EM Inversiones (ver lib/em-inversiones.ts): a quien
 * hay que cobrarle, cuanto y en que cuota va, con todos los recibos para
 * imprimir de una y la planilla para el cobrador.
 *
 * Se puede preparar otro dia (el de mañana, la noche antes). Lo que se le
 * cobra a cada uno se cuenta con lo que ha abonado hasta este momento.
 */
export default async function CobroDelDiaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const { user, staff: me } = await requireSession();
  if (!esEmInversiones(user.businessName)) notFound();

  const params = await searchParams;
  const hoy = todayIn(user.timezone);
  const dia = params.dia && isValidDay(params.dia) ? params.dia : hoy;
  const pais = user.country;
  const libre = porQueNoSeCobra(dia, pais);
  const opciones = opcionesPlanDe(user);

  // El empleado con cuenta propia ve solo los prestamos que anoto, igual que
  // en Cuentas por cobrar.
  const propias = esDueno(me.role);
  const deudas = await db.debt.findMany({
    where: {
      userId: user.id,
      status: "PENDIENTE",
      installments: { not: null },
      ...(propias ? {} : { staffId: me.id }),
    },
    select: {
      id: true,
      clientName: true,
      clientPhone: true,
      clientAddress: true,
      amount: true,
      day: true,
      installments: true,
      frequency: true,
      status: true,
      receiptSeq: true,
      payments: { select: { amount: true } },
    },
  });

  // El domingo y el festivo no se sale a cobrar: no hay lista.
  const filas = libre ? [] : filasDeCobro(deudas, dia, opciones);
  const total = filas.reduce((s, f) => s + f.aCobrar, 0);
  const atrasados = filas.filter((f) => f.atraso > 0);
  const totalAtrasado = atrasados.reduce((s, f) => s + f.atraso, 0);

  const anterior = anteriorDiaDeCobro(dia, pais);
  const siguiente = siguienteDiaDeCobro(addDays(dia, 1), pais);
  const enlace = (d: string) => "/panel/cartera/cobro" + (d === hoy ? "" : "?dia=" + d);

  return (
    <>
      <PageHeader
        title="Cobro del día"
        subtitle={prettyDay(dia) + (dia === hoy ? " · hoy" : "") + (propias ? "" : " · Solo ves los tuyos")}
      >
        <Link href="/panel/cartera" className="btn-ghost btn-sm">
          Volver a cuentas por cobrar
        </Link>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={enlace(anterior)} className="btn-ghost btn-sm" aria-label="Día de cobro anterior">
          ← Anterior
        </Link>
        {dia !== hoy && (
          <Link href={enlace(hoy)} className="btn-ghost btn-sm">
            Hoy
          </Link>
        )}
        <Link href={enlace(siguiente)} className="btn-ghost btn-sm" aria-label="Siguiente día de cobro">
          Siguiente →
        </Link>
        <form action="/panel/cartera/cobro" className="flex items-center gap-2">
          <input
            className="input py-1.5 text-sm"
            type="date"
            name="dia"
            defaultValue={dia}
            aria-label="Elegir el día"
          />
          <button type="submit" className="btn-ghost btn-sm">
            Ver
          </button>
        </form>
      </div>

      {libre ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-body">
          <Icon name="calendar" className="h-4 w-4 shrink-0 text-brand-600" />
          <span>
            <strong>Ese día no se cobra</strong> ({libre}). Las cuotas no caen en domingo ni en festivo, y
            el atraso no corre.
          </span>
          <Link href={enlace(siguiente)} className="link ml-auto">
            Ir al {prettyDay(siguiente)}
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="A cobrar"
              value={money(total, user.currency)}
              hint={filas.length + (filas.length === 1 ? " cliente" : " clientes")}
              tone="brand"
            />
            <Stat
              label="Atrasados"
              value={money(totalAtrasado, user.currency)}
              hint={atrasados.length + (atrasados.length === 1 ? " persona" : " personas")}
              tone={totalAtrasado > 0 ? "bad" : "good"}
            />
            <Stat
              label="Al día"
              value={String(filas.length - atrasados.length)}
              hint="Solo la cuota del día"
              tone="good"
            />
            <Stat label="Préstamos activos" value={String(deudas.length)} hint="Con cuotas" />
          </div>

          <Card
            className="mt-4"
            title="Imprimir"
            subtitle="Los recibos salen todos seguidos (o tres por fila en hoja normal). La planilla es para el cobrador."
          >
            {filas.length > 0 ? (
              <ImprimirCobro
                filas={filas}
                dia={dia}
                soloBluetooth={!propias}
                negocio={{
                  businessName: user.businessName,
                  businessPhone: user.phone,
                  currency: user.currency,
                  marcaGratis: !esPlanCompleto(user),
                }}
              />
            ) : (
              <p className="text-sm text-muted">No hay nada que imprimir: nadie tiene que pagar ese día.</p>
            )}
          </Card>

          <div className="mt-4">
            {filas.length === 0 ? (
              <Card>
                <Empty
                  title="Ese día no le toca pagar a nadie"
                  hint="Todos van al día o ya pagaron la cuota de ese día."
                />
              </Card>
            ) : (
              <ul className="space-y-2" data-filas-cobro>
                {filas.map((f, i) => (
                  <li key={f.id} className="card-tight flex flex-wrap items-center gap-3">
                    <span className="w-6 text-right text-xs text-subtle">{i + 1}</span>
                    <Link href={"/panel/cartera/" + f.id} className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-strong">
                        {f.clientName}
                        {f.atraso > 0 && (
                          <Badge tone="red">
                            Atrasado {f.cuotasAtrasadas} {f.cuotasAtrasadas === 1 ? "cuota" : "cuotas"}
                          </Badge>
                        )}
                      </span>
                      <span className="block text-xs text-muted">
                        Cuota {f.cuotaN} de {f.totalCuotas} · {money(f.valorCuota, user.currency)}
                        {f.clientPhone ? " · " + f.clientPhone : ""}
                      </span>
                      {f.clientAddress && <span className="block text-xs text-subtle">{f.clientAddress}</span>}
                    </Link>
                    <span className="text-right">
                      <span className={"block text-sm font-bold " + (f.atraso > 0 ? "text-bad" : "text-strong")}>
                        {money(f.aCobrar, user.currency)}
                      </span>
                      <span className="block text-[11px] text-subtle">
                        Debe {money(f.saldo, user.currency)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
