import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { prettyDay } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { NuevoReporte } from "@/components/NuevoReporte";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

/**
 * Los reportes de visita.
 *
 * El administrador ve los de todos, con los nuevos del personal señalados. El
 * empleado ve solo los suyos y si el administrador ya los miro.
 */
export default async function InformesPage() {
  // Reportes es una de las pantallas fijas del empleado de asistencia: sin
  // avisarle a requireSession(), lo mandaria de vuelta a Marcar en vez de
  // dejarlo verla.
  const { user, staff } = await requireSession({ asistenciaOk: true });
  const esDueno = staff.role === "DUENO";

  const [sitios, informes, personas] = await Promise.all([
    db.workSite.findMany({
      where: { userId: user.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.visitReport.findMany({
      where: { userId: user.id, ...(esDueno ? {} : { createdByStaffId: staff.id }) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        day: true,
        clientName: true,
        sentAt: true,
        seenAt: true,
        createdByStaffId: true,
        site: { select: { name: true } },
        _count: { select: { photos: true } },
      },
    }),
    esDueno
      ? db.staff.findMany({ where: { userId: user.id }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const nombres = new Map(personas.map((p) => [p.id, p.name]));
  const esNuevo = (r: (typeof informes)[number]) =>
    esDueno && Boolean(r.sentAt) && !r.seenAt && r.createdByStaffId !== staff.id;
  const nuevos = informes.filter(esNuevo).length;

  return (
    <>
      <PageHeader
        title={esDueno ? "Reportes" : "Mis reportes"}
        subtitle={
          esDueno
            ? nuevos > 0
              ? nuevos === 1
                ? "Tienes 1 reporte nuevo del personal"
                : "Tienes " + nuevos + " reportes nuevos del personal"
              : "Los reportes de visita con fotos, en PDF para mandárselos al cliente"
            : "Haz el reporte con fotos. Si no hay señal, se envía solo cuando vuelva."
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
        <div className="order-2 min-w-0 space-y-3 lg:order-1">
          {esDueno && !user.hasLogo && (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-[13px] text-body">
              <Icon name="image" className="h-5 w-5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">Sube tu logo para que salga en el encabezado de los PDF.</span>
              <Link href="/panel/personalizar" className="btn-ghost btn-sm shrink-0">
                Subir logo
              </Link>
            </div>
          )}

          {informes.length === 0 ? (
            <Card>
              <Empty
                title="Todavía no hay reportes"
                hint={esDueno ? "Cuando el personal envíe uno, aparece aquí." : "Haz el primero con el formulario."}
              />
            </Card>
          ) : (
            <ul className="animate-lista space-y-3">
              {informes.map((r) => (
                <li key={r.id}>
                  <Link
                    href={"/panel/informes/" + r.id}
                    data-informe={r.id}
                    className={
                      "card-tight flex items-center gap-3 transition-shadow hover:shadow-card-hover " +
                      (esNuevo(r) ? "ring-2 ring-brand-500/40" : "")
                    }
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Icon name="image" className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold text-strong">{r.title}</span>
                        {esNuevo(r) && <Badge tone="blue">Nuevo</Badge>}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        {prettyDay(r.day)}
                        {esDueno && r.createdByStaffId && nombres.get(r.createdByStaffId) && " · " + nombres.get(r.createdByStaffId)}
                        {r.site && " · " + r.site.name}
                        {r.clientName && " · " + r.clientName}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] text-muted">
                        {r._count.photos} {r._count.photos === 1 ? "foto" : "fotos"}
                      </span>
                      {!esDueno &&
                        (r.seenAt ? (
                          <Badge tone="green">Visto</Badge>
                        ) : r.sentAt ? (
                          <Badge tone="slate">Enviado</Badge>
                        ) : (
                          <Badge tone="amber">Subiendo</Badge>
                        ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="mb-3 text-sm font-bold text-strong">Nuevo reporte</h2>
          <NuevoReporte hoy={todayIn(user.timezone)} sitios={sitios} esAdministrador={esDueno} />
        </Card>
      </div>
    </>
  );
}
