import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { prettyDay } from "@/lib/format";
import { Card, Empty, PageHeader } from "@/components/ui";
import { InformeForm } from "@/components/InformeForm";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function InformesPage() {
  const { user } = await requireSession();

  const [sitios, informes] = await Promise.all([
    db.workSite.findMany({
      where: { userId: user.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.visitReport.findMany({
      where: { userId: user.id },
      orderBy: [{ day: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        title: true,
        day: true,
        clientName: true,
        site: { select: { name: true } },
        _count: { select: { photos: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle="El reporte de cada visita con fotos, en PDF para mandárselo al cliente"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
        <div>
          {informes.length === 0 ? (
            <Card>
              <Empty
                title="Todavía no hay reportes"
                hint="Crea el primero a la derecha. Después le agregas las fotos desde el teléfono."
              />
            </Card>
          ) : (
            <ul className="animate-lista space-y-3">
              {informes.map((r) => (
                <li key={r.id}>
                  <Link
                    href={"/panel/informes/" + r.id}
                    className="card-tight flex items-center gap-3 transition-shadow hover:shadow-card-hover"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Icon name="image" className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-strong">{r.title}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {prettyDay(r.day)}
                        {r.site && " · " + r.site.name}
                        {r.clientName && " · " + r.clientName}
                      </span>
                    </span>
                    <span className="text-[11px] text-muted">
                      {r._count.photos} {r._count.photos === 1 ? "foto" : "fotos"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card>
          <h2 className="mb-3 text-sm font-bold text-strong">Nuevo reporte</h2>
          <InformeForm today={todayIn(user.timezone)} sitios={sitios} />
        </Card>
      </div>
    </>
  );
}
