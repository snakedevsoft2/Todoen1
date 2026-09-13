import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { enlaceMapa, prettyDistancia } from "@/lib/geo";
import { Card, PageHeader } from "@/components/ui";
import { Marcador } from "@/components/Marcador";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

/**
 * La pantalla que usa el empleado: marcar y ver lo suyo del dia.
 *
 * Es de la persona, no del negocio: aqui cada quien ve SUS marcajes y nada
 * mas. La planilla de todos es otra pantalla y es del dueno.
 */
export default async function MarcarPage() {
  const { user, staff } = await requireSession();
  const hoy = todayIn(user.timezone);

  // El dia va de medianoche a medianoche en la zona del negocio.
  const desde = new Date(hoy + "T00:00:00");
  const hasta = new Date(hoy + "T23:59:59.999");

  const [sitios, mios] = await Promise.all([
    db.workSite.findMany({
      where: { userId: user.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.attendance.findMany({
      where: { staffId: staff.id, markedAt: { gte: desde, lte: hasta } },
      orderBy: { markedAt: "desc" },
      include: { site: { select: { name: true, radiusM: true } } },
    }),
  ]);

  const vigentes = mios.filter((m) => !m.voidedAt);
  const ultimo = vigentes[0]?.kind ?? null;

  const hora = (d: Date) =>
    d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <>
      <PageHeader title="Marcar" subtitle={"Hola " + staff.name + ", esta es tu jornada de hoy"} />

      <div className="mx-auto grid w-full max-w-xl gap-4">
        <Card>
          <Marcador sitios={sitios} ultimo={ultimo} />
        </Card>

        <Card>
          <h2 className="text-sm font-bold text-strong">Lo que marcaste hoy</h2>

          {mios.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Todavía no has marcado nada hoy. Toca el botón de arriba cuando empieces.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {mios.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span
                    className={
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full " +
                      (m.voidedAt
                        ? "bg-surface-3 text-subtle"
                        : m.kind === "ENTRADA"
                          ? "bg-good-soft text-good"
                          : "bg-brand-50 text-brand-600")
                    }
                  >
                    <Icon
                      name={m.kind === "ENTRADA" ? "arrowIn" : "arrowOut"}
                      className="h-4 w-4"
                    />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        "block text-sm font-bold " +
                        (m.voidedAt ? "text-subtle line-through" : "text-strong")
                      }
                    >
                      {m.kind === "ENTRADA" ? "Entrada" : "Salida"} · {hora(m.markedAt)}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {m.site?.name ?? "Sin sitio"}
                      {m.distanceM !== null && " · a " + prettyDistancia(m.distanceM)}
                      {m.lat === null && " · sin ubicación"}
                    </span>
                    {m.voidedAt && (
                      <span className="block text-[11px] text-bad">
                        Anulado: {m.voidedReason}
                      </span>
                    )}
                  </span>

                  {m.lat !== null && m.lng !== null && (
                    <a
                      href={enlaceMapa(m.lat, m.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost btn-sm"
                    >
                      Ver mapa
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
