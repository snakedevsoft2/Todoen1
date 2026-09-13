import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { enElSitio, enlaceMapa, prettyDistancia } from "@/lib/geo";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { AnularMarcaje } from "@/components/AnularMarcaje";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

/** Horas y minutos entre dos momentos, en palabras. */
function duracion(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60);
  return h > 0 ? h + " h " + (min % 60) + " min" : min + " min";
}

export default async function PlanillaPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { user } = await requireOwner();
  const params = await searchParams;

  const hoy = todayIn(user.timezone);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(params.d ?? "") ? (params.d as string) : hoy;

  const desde = new Date(dia + "T00:00:00");
  const hasta = new Date(dia + "T23:59:59.999");

  const [personal, marcajes] = await Promise.all([
    db.staff.findMany({
      where: { userId: user.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.attendance.findMany({
      where: { userId: user.id, markedAt: { gte: desde, lte: hasta } },
      orderBy: { markedAt: "asc" },
      include: { site: { select: { name: true, radiusM: true } } },
    }),
  ]);

  const vigentes = marcajes.filter((m) => !m.voidedAt);

  // Se arma la jornada de cada persona emparejando entradas con salidas.
  const jornadas = personal.map((p) => {
    const suyos = vigentes.filter((m) => m.staffId === p.id);
    const entradas = suyos.filter((m) => m.kind === "ENTRADA");
    const salidas = suyos.filter((m) => m.kind === "SALIDA");

    let trabajado = 0;
    for (let i = 0; i < entradas.length; i += 1) {
      const salida = salidas[i];
      // Sin salida todavia, se cuenta hasta ahora: es lo que lleva trabajado.
      const fin = salida ? salida.markedAt.getTime() : dia === hoy ? Date.now() : null;
      if (fin) trabajado += Math.max(0, fin - entradas[i].markedAt.getTime());
    }

    const ultimo = suyos[suyos.length - 1];
    const estado = !ultimo ? "sin marcar" : ultimo.kind === "ENTRADA" ? "adentro" : "salio";

    return { persona: p, suyos, trabajado, estado };
  });

  const adentro = jornadas.filter((j) => j.estado === "adentro").length;
  const sinMarcar = jornadas.filter((j) => j.estado === "sin marcar").length;
  const lejos = vigentes.filter(
    (m) => m.site && enElSitio(m.distanceM, m.site.radiusM, m.accuracyM) === false
  ).length;

  const hora = (d: Date) =>
    d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <>
      <PageHeader title="Planilla" subtitle={dia === hoy ? "Hoy" : dia}>
        <form className="flex items-center gap-2">
          <input className="input w-auto" type="date" name="d" defaultValue={dia} />
          <button type="submit" className="btn-ghost btn-sm">
            Ir
          </button>
        </form>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Adentro ahora" value={String(adentro)} hint="Marcaron y no han salido" tone="good" />
        <Stat
          label="Sin marcar"
          value={String(sinMarcar)}
          hint={"De " + personal.length + " personas"}
          tone={sinMarcar > 0 ? "amber" : "good"}
        />
        <Stat label="Marcajes del día" value={String(vigentes.length)} />
        <Stat
          label="Lejos del sitio"
          value={String(lejos)}
          hint="Marcaron fuera del radio"
          tone={lejos > 0 ? "bad" : "good"}
        />
      </div>

      {personal.length === 0 ? (
        <Card className="mt-5">
          <Empty
            title="Todavía no tienes personal"
            hint="Agrega a tu gente en Personal. Cada quien entra con su usuario y marca desde su teléfono."
          />
        </Card>
      ) : (
        <ul className="mt-5 space-y-3">
          {jornadas.map(({ persona, suyos, trabajado, estado }) => (
            <li key={persona.id} className="card-tight">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-strong">{persona.name}</span>
                  <span className="block text-[11px] text-muted">
                    {estado === "sin marcar"
                      ? "No ha marcado"
                      : estado === "adentro"
                        ? "Adentro · lleva " + duracion(trabajado)
                        : "Salió · " + duracion(trabajado)}
                  </span>
                </span>
                <span
                  className={
                    "rounded-full px-2.5 py-1 text-[11px] font-bold " +
                    (estado === "adentro"
                      ? "bg-good-soft text-good"
                      : estado === "salio"
                        ? "bg-surface text-muted"
                        : "bg-warn-soft text-warn")
                  }
                >
                  {estado === "adentro" ? "Adentro" : estado === "salio" ? "Salió" : "Sin marcar"}
                </span>
              </div>

              {suyos.length > 0 && (
                <ul className="mt-3 divide-y divide-line border-t border-line pt-1">
                  {suyos.map((m) => {
                    const dentro = m.site
                      ? enElSitio(m.distanceM, m.site.radiusM, m.accuracyM)
                      : null;
                    return (
                      <li key={m.id} className="flex flex-wrap items-center gap-2.5 py-2">
                        <Icon
                          name={m.kind === "ENTRADA" ? "arrowIn" : "arrowOut"}
                          className={
                            "h-4 w-4 shrink-0 " +
                            (m.kind === "ENTRADA" ? "text-good" : "text-brand-600")
                          }
                        />
                        <span className="text-[13px] font-bold text-strong">
                          {hora(m.markedAt)}
                        </span>
                        <span className="min-w-0 flex-1 text-[11px] text-muted">
                          {m.site?.name ?? "Sin sitio"}
                          {m.distanceM !== null && (
                            <span className={dentro === false ? "text-bad" : ""}>
                              {" · a " + prettyDistancia(m.distanceM)}
                              {dentro === false && " (lejos)"}
                            </span>
                          )}
                          {m.lat === null && " · sin ubicación"}
                          {/* Si tardo en llegar al servidor, viajo en la cola. */}
                          {m.receivedAt.getTime() - m.markedAt.getTime() > 120000 && (
                            <span title="Se marcó sin señal y se envió después">
                              {" · marcado sin señal"}
                            </span>
                          )}
                        </span>

                        {m.lat !== null && m.lng !== null && (
                          <a
                            href={enlaceMapa(m.lat, m.lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-brand-600 underline"
                          >
                            Mapa
                          </a>
                        )}

                        <AnularMarcaje id={m.id} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {marcajes.some((m) => m.voidedAt) && (
        <Card className="mt-5">
          <h2 className="text-sm font-bold text-strong">Anulados este día</h2>
          <ul className="mt-2 divide-y divide-line">
            {marcajes
              .filter((m) => m.voidedAt)
              .map((m) => (
                <li key={m.id} className="py-2 text-[13px]">
                  <span className="text-subtle line-through">
                    {m.kind === "ENTRADA" ? "Entrada" : "Salida"} {hora(m.markedAt)}
                  </span>
                  <span className="ml-2 text-[11px] text-bad">{m.voidedReason}</span>
                </li>
              ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">
            Un marcaje anulado no se borra: queda aquí con su motivo. Es lo que hace que la planilla
            sirva como prueba.
          </p>
        </Card>
      )}
    </>
  );
}
