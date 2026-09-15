import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, dayIn, inicioDelDiaEn, isValidDay, startOfMonth, todayIn } from "@/lib/dates";
import { money, prettyDay, shortDay } from "@/lib/format";
import { TIPOS_ACTIVIDAD, esTipoActividad } from "@/lib/actividad";
import { etiquetaDeRol } from "@/lib/staff";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Todo lo que hizo una persona del equipo, del mas reciente al mas viejo:
 * ventas, cobros, gastos, abonos, clientes, caja, inventario, y lo que borro
 * o cambio. Solo el dueño lo ve.
 */
export default async function ActividadEmpleadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { user } = await requireOwner();
  const { id } = await params;
  const persona = await db.staff.findFirst({ where: { id, userId: user.id } });
  if (!persona) notFound();

  const sp = await searchParams;
  const hoy = todayIn(user.timezone);
  const hasta = sp.hasta && isValidDay(sp.hasta) ? sp.hasta : hoy;
  const desdePedido = sp.desde && isValidDay(sp.desde) ? sp.desde : startOfMonth(hoy);
  const desde = desdePedido <= hasta ? desdePedido : hasta;
  const where = {
    userId: user.id,
    staffId: persona.id,
    createdAt: { gte: inicioDelDiaEn(desde, user.timezone), lt: inicioDelDiaEn(addDays(hasta, 1), user.timezone) },
  };

  const [filas, porTipo] = await Promise.all([
    db.staffActivity.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 }),
    db.staffActivity.groupBy({ by: ["tipo"], where, _count: { _all: true }, _sum: { monto: true } }),
  ]);

  const suma = (...tipos: string[]) => porTipo.filter((t) => tipos.includes(t.tipo)).reduce((s, t) => s + (t._sum.monto ?? 0), 0);
  const cuantas = (...tipos: string[]) => porTipo.filter((t) => tipos.includes(t.tipo)).reduce((s, t) => s + t._count._all, 0);
  const hora = (d: Date) =>
    d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: user.timezone });

  const porDia = new Map<string, typeof filas>();
  for (const f of filas) {
    const dia = dayIn(f.createdAt, user.timezone);
    porDia.set(dia, [...(porDia.get(dia) ?? []), f]);
  }

  const enlace = (d: string, h: string) => "/panel/equipo/" + persona.id + "?desde=" + d + "&hasta=" + h;
  const rangos = [
    { label: "Hoy", desde: hoy, hasta: hoy },
    { label: "Últimos 7 días", desde: addDays(hoy, -6), hasta: hoy },
    { label: "Este mes", desde: startOfMonth(hoy), hasta: hoy },
  ];
  const cambios = cuantas("borrado", "cambio");

  return (
    <>
      <PageHeader
        title={persona.name}
        subtitle={etiquetaDeRol(persona.role, user.businessType) + " · lo que hizo del " + shortDay(desde) + " al " + shortDay(hasta)}
      >
        <Link href="/panel/equipo" className="btn-ghost btn-sm">
          Volver al equipo
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {rangos.map((r) => (
          <Link
            key={r.label}
            href={enlace(r.desde, r.hasta)}
            className={"btn-ghost btn-sm " + (r.desde === desde && r.hasta === hasta ? "border-brand-500 text-brand-700" : "")}
          >
            {r.label}
          </Link>
        ))}
        <form action={"/panel/equipo/" + persona.id} className="flex flex-wrap items-center gap-2">
          <input type="date" name="desde" defaultValue={desde} className="input py-1 text-[13px]" aria-label="Desde" />
          <input type="date" name="hasta" defaultValue={hasta} className="input py-1 text-[13px]" aria-label="Hasta" />
          <button type="submit" className="btn-ghost btn-sm">
            Ver
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ventas y cobros" value={money(suma("venta", "cobro"), user.currency)} hint={cuantas("venta", "cobro") + " registrados"} tone="good" />
        <Stat label="Gastos anotados" value={money(suma("gasto"), user.currency)} hint={cuantas("gasto") + " gastos"} tone="bad" />
        <Stat label="Abonos recibidos" value={money(suma("abono"), user.currency)} hint={cuantas("abono") + " abonos"} tone="good" />
        <Stat
          label="Todo lo que hizo"
          value={String(filas.length)}
          hint={cambios > 0 ? cambios + " borrados o cambios" : "Sin borrados ni cambios"}
          tone={cambios > 0 ? "amber" : "default"}
        />
      </div>

      <Card className="mt-4" title="Historial" subtitle={filas.length === 500 ? "Se muestran los 500 más recientes" : undefined}>
        {filas.length === 0 ? (
          <Empty title="No hizo nada en estas fechas" hint="Prueba con otro rango de días." />
        ) : (
          <div className="space-y-4" data-actividad-empleado>
            {[...porDia.entries()].map(([dia, lista]) => (
              <section key={dia}>
                <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-muted">{prettyDay(dia)}</h3>
                <ul className="divide-y divide-line">
                  {lista.map((f) => {
                    const tipo = esTipoActividad(f.tipo) ? TIPOS_ACTIVIDAD[f.tipo] : { label: f.tipo, tone: "slate" as const };
                    return (
                      <li key={f.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]" data-fila-actividad>
                        <span className="w-20 shrink-0 text-muted">{hora(f.createdAt)}</span>
                        <Badge tone={tipo.tone}>{tipo.label}</Badge>
                        <span className="min-w-0 flex-1 text-body">{f.detalle}</span>
                        {f.monto !== null && <span className="num font-semibold text-strong">{money(f.monto, user.currency)}</span>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
