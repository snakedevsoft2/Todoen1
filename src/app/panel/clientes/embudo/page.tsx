import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inicioDelDiaEn, startOfMonth, todayIn } from "@/lib/dates";
import { money } from "@/lib/format";
import { resumenEmbudo, tasaDeCierre, valorAbierto, type Etapa } from "@/lib/crm";
import { opcionesDeClientes, personasDe } from "@/lib/crm-filas";
import { Card, Empty, Stat } from "@/components/ui";
import { Embudo } from "@/components/Embudo";
import { OportunidadForm } from "@/components/OportunidadForm";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const DIA = 86_400_000;

export default async function EmbudoPage() {
  const { user, staff } = await requireSession();
  const hoy = todayIn(user.timezone);
  const ahora = Date.now();

  const [deals, cerradas, ganadoMes, clientes, personas] = await Promise.all([
    // Las cerradas hace mas de un mes salen del tablero: ya no hay nada que
    // hacer con ellas y solo alargan las columnas de Ganado y Perdido.
    db.deal.findMany({
      where: {
        userId: user.id,
        OR: [{ closedAt: null }, { closedAt: { gte: new Date(ahora - 30 * DIA) } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 600,
      include: { customer: { select: { name: true } }, staff: { select: { name: true } } },
    }),
    db.deal.findMany({
      where: { userId: user.id, closedAt: { gte: new Date(ahora - 90 * DIA) } },
      select: { stage: true, value: true },
    }),
    db.deal.aggregate({
      where: {
        userId: user.id,
        stage: "GANADO",
        closedAt: { gte: inicioDelDiaEn(startOfMonth(hoy), user.timezone) },
      },
      _sum: { value: true },
    }),
    opcionesDeClientes(user.id),
    personasDe(user.id),
  ]);

  const resumen = resumenEmbudo(deals);
  const tasa = tasaDeCierre(resumenEmbudo(cerradas));
  const abiertas = deals.filter((d) => !d.closedAt).length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="En juego"
          value={money(valorAbierto(resumen), user.currency)}
          hint={abiertas + (abiertas === 1 ? " oportunidad abierta" : " oportunidades abiertas")}
        />
        <Stat
          label="Ganado este mes"
          value={money(ganadoMes._sum.value ?? 0, user.currency)}
          tone="good"
        />
        <Stat
          label="Tasa de cierre"
          value={tasa === null ? "—" : tasa + "%"}
          hint="De las cerradas en 90 días"
        />
        <Stat
          label="Negociando"
          value={money(resumen.NEGOCIACION.valor, user.currency)}
          hint={resumen.NEGOCIACION.cuantos + " a punto de decidir"}
          tone="amber"
        />
      </div>

      <details className="card mt-5" open={deals.length === 0 && clientes.length > 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-[15px] text-strong">
          <Icon name="plus" className="h-4 w-4" />
          Nueva oportunidad
        </summary>
        <div className="mt-4 max-w-2xl">
          {clientes.length === 0 ? (
            <Empty
              title="Primero agrega un cliente"
              hint="Cada oportunidad es de un cliente. Agrégalo en la pestaña Clientes."
            />
          ) : (
            <OportunidadForm
              currency={user.currency}
              yoId={staff.id}
              personas={personas}
              clientes={clientes}
              submitLabel="Agregar al embudo"
            />
          )}
        </div>
      </details>

      <Card
        className="mt-4"
        title="Tablero"
        subtitle="Arrastra cada tarjeta a la columna en que va, o cámbiala con su selector"
      >
        {deals.length === 0 ? (
          <Empty
            title="El embudo está vacío"
            hint="Agrega la primera oportunidad: lo que un cliente podría comprarte y cuánto vale."
          />
        ) : (
          <Embudo
            currency={user.currency}
            tarjetas={deals.map((d) => ({
              id: d.id,
              title: d.title,
              value: d.value,
              stage: d.stage as Etapa,
              customerId: d.customerId,
              customerName: d.customer.name,
              staffName: d.staff?.name ?? null,
              expectedDay: d.expectedDay,
            }))}
          />
        )}
        {deals.length > 0 && (
          <p className="mt-2 text-xs text-subtle">
            Las ganadas y perdidas hace más de 30 días salen del tablero; siguen en la{" "}
            <Link href="/panel/clientes" className="underline">
              ficha de cada cliente
            </Link>
            .
          </p>
        )}
      </Card>
    </>
  );
}
