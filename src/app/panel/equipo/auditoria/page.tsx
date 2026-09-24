import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, dayIn, inicioDelDiaEn, isValidDay, startOfMonth, todayIn } from "@/lib/dates";
import { prettyDay, shortDay } from "@/lib/format";
import { TIPOS_ACTIVIDAD, esTipoActividad } from "@/lib/actividad";
import { etiquetaDeRol } from "@/lib/staff";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { BotonImprimirPagina } from "@/components/BotonImprimirPagina";

export const dynamic = "force-dynamic";

/**
 * Todo lo que el equipo borró o cambió, de todas las personas juntas: el
 * registro de eventos que el dueño revisa para saber si el jefe de patio (o
 * cualquier otro con permiso) tocó algo que ya estaba registrado. Nadie mas
 * ve esta pantalla: el módulo "equipo" es ownerOnly.
 */
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { user } = await requireOwner();

  const sp = await searchParams;
  const hoy = todayIn(user.timezone);
  const hasta = sp.hasta && isValidDay(sp.hasta) ? sp.hasta : hoy;
  const desdePedido = sp.desde && isValidDay(sp.desde) ? sp.desde : startOfMonth(hoy);
  const desde = desdePedido <= hasta ? desdePedido : hasta;
  const where = {
    userId: user.id,
    tipo: { in: ["borrado", "cambio"] },
    createdAt: { gte: inicioDelDiaEn(desde, user.timezone), lt: inicioDelDiaEn(addDays(hasta, 1), user.timezone) },
  };

  const filas = await db.staffActivity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { staff: { select: { name: true, role: true, color: true } } },
    take: 500,
  });

  const hora = (d: Date) =>
    d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: user.timezone });

  const porDia = new Map<string, typeof filas>();
  for (const f of filas) {
    const dia = dayIn(f.createdAt, user.timezone);
    porDia.set(dia, [...(porDia.get(dia) ?? []), f]);
  }

  const enlace = (d: string, h: string) => "/panel/equipo/auditoria?desde=" + d + "&hasta=" + h;
  const rangos = [
    { label: "Hoy", desde: hoy, hasta: hoy },
    { label: "Últimos 7 días", desde: addDays(hoy, -6), hasta: hoy },
    { label: "Este mes", desde: startOfMonth(hoy), hasta: hoy },
  ];
  const borrados = filas.filter((f) => f.tipo === "borrado").length;
  const cambios = filas.filter((f) => f.tipo === "cambio").length;

  return (
    <>
      <PageHeader title="Auditoría" subtitle={"Lo que se borró o se cambió del " + shortDay(desde) + " al " + shortDay(hasta)}>
        <div className="flex flex-wrap gap-2 no-print">
          <a href={"/panel/exportar/auditoria?from=" + desde + "&to=" + hasta} className="btn-ghost btn-sm">
            <Icon name="download" className="h-4 w-4" />
            Exportar a Excel
          </a>
          <BotonImprimirPagina />
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2 no-print">
        {rangos.map((r) => (
          <Link
            key={r.label}
            href={enlace(r.desde, r.hasta)}
            className={"btn-ghost btn-sm " + (r.desde === desde && r.hasta === hasta ? "border-brand-500 text-brand-700" : "")}
          >
            {r.label}
          </Link>
        ))}
        <form action="/panel/equipo/auditoria" className="flex flex-wrap items-center gap-2">
          <input type="date" name="desde" defaultValue={desde} className="input py-1 text-[13px]" aria-label="Desde" />
          <input type="date" name="hasta" defaultValue={hasta} className="input py-1 text-[13px]" aria-label="Hasta" />
          <button type="submit" className="btn-ghost btn-sm">
            Ver
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Eventos" value={String(filas.length)} tone={filas.length > 0 ? "amber" : "default"} />
        <Stat label="Borrados" value={String(borrados)} />
        <Stat label="Cambios" value={String(cambios)} />
      </div>

      <Card className="mt-4" title="Historial" subtitle={filas.length === 500 ? "Se muestran los 500 más recientes" : undefined}>
        {filas.length === 0 ? (
          <Empty title="Nadie borró ni cambió nada en estas fechas" hint="Prueba con otro rango de días." />
        ) : (
          <div className="space-y-4">
            {[...porDia.entries()].map(([dia, lista]) => (
              <section key={dia}>
                <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-muted">{prettyDay(dia)}</h3>
                <ul className="divide-y divide-line">
                  {lista.map((f) => {
                    const tipo = esTipoActividad(f.tipo) ? TIPOS_ACTIVIDAD[f.tipo] : { label: f.tipo, tone: "slate" as const };
                    return (
                      <li key={f.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                        <span className="w-20 shrink-0 text-muted">{hora(f.createdAt)}</span>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: f.staff.color }}
                          aria-hidden="true"
                        />
                        <span className="w-32 shrink-0 truncate text-body">
                          {f.staff.name}
                          <span className="ml-1 text-[11px] text-subtle">
                            ({etiquetaDeRol(f.staff.role, user.businessType)})
                          </span>
                        </span>
                        <Badge tone={tipo.tone}>{tipo.label}</Badge>
                        <span className="min-w-0 flex-1 text-body">{f.detalle}</span>
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
