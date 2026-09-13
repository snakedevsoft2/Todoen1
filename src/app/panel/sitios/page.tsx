import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { enlaceMapa } from "@/lib/geo";
import { Card, Empty, PageHeader } from "@/components/ui";
import { SitioForm } from "@/components/SitioForm";
import { SubmitButton } from "@/components/SubmitButton";
import { alternarSitioAction } from "@/actions/asistencia";

export const dynamic = "force-dynamic";

export default async function SitiosPage() {
  const { user } = await requireOwner();

  const sitios = await db.workSite.findMany({
    where: { userId: user.id },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { marks: true } } },
  });

  return (
    <>
      <PageHeader
        title="Sitios"
        subtitle="Dónde trabaja tu gente. Sirve para saber desde dónde marcó cada quien"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {sitios.length === 0 ? (
            <Card>
              <Empty
                title="Todavía no hay sitios"
                hint="Agrega el primero a la derecha. Si no agregas ninguno, la gente igual puede marcar: solo que no se mide a qué distancia estaba."
              />
            </Card>
          ) : (
            <ul className="space-y-3">
              {sitios.map((s) => (
                <li key={s.id} className="card-tight flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        "block text-sm font-bold " + (s.active ? "text-strong" : "text-subtle")
                      }
                    >
                      {s.name}
                      {!s.active && " · inactivo"}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {s.address ?? "Sin dirección"}
                      {s.lat !== null ? " · radio " + s.radiusM + " m" : " · sin ubicación"}
                      {" · "}
                      {s._count.marks} {s._count.marks === 1 ? "marcaje" : "marcajes"}
                    </span>
                  </span>

                  {s.lat !== null && s.lng !== null && (
                    <a
                      href={enlaceMapa(s.lat, s.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost btn-sm"
                    >
                      Mapa
                    </a>
                  )}

                  <form action={alternarSitioAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <SubmitButton className="btn-ghost btn-sm" pendingText="...">
                      {s.active ? "Desactivar" : "Activar"}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card>
          <h2 className="text-sm font-bold text-strong">Agregar un sitio</h2>
          <p className="mb-3 mt-1 text-[13px] text-muted">
            Párate en el sitio y toca <strong className="font-semibold">Usar mi ubicación</strong>:
            es la forma más exacta de guardarlo.
          </p>
          <SitioForm />
        </Card>
      </div>
    </>
  );
}
