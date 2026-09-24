import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, inicioDelDiaEn, todayIn } from "@/lib/dates";
import { enlaceMapa, prettyDistancia } from "@/lib/geo";
import { Card, PageHeader } from "@/components/ui";
import { Marcador, type Siguiente } from "@/components/Marcador";
import { Icon } from "@/components/Icon";
import { esPlanCompleto } from "@/lib/plan";

export const dynamic = "force-dynamic";

/** Una salida despues de esto ya no cierra la entrada anterior. Ver jornada-reglas. */
const VENTANA_MS = 20 * 60 * 60 * 1000;

/**
 * La pantalla que usa el empleado: marcar y ver lo suyo del dia.
 *
 * Es de la persona, no del negocio: aqui cada quien ve SUS marcajes y nada
 * mas. La planilla de todos es otra pantalla y es del administrador.
 */
export default async function MarcarPage() {
  // Marcar es una de las pantallas fijas tanto del empleado de asistencia
  // como del lavador: sin avisarle a requireSession(), redirigiria a cada
  // uno de vuelta a SU pantalla fija (que puede ser esta misma), armando un
  // ciclo de redirecciones. Ver panel/layout.tsx.
  const { user, staff } = await requireSession({ asistenciaOk: true, lavadorOk: true });
  const hoy = todayIn(user.timezone);

  // El dia va de medianoche a medianoche en la zona del NEGOCIO, no del
  // servidor: en Vercel el servidor esta en UTC y el dia se correria 5 horas.
  const desde = inicioDelDiaEn(hoy, user.timezone);
  const hasta = new Date(inicioDelDiaEn(addDays(hoy, 1), user.timezone).getTime() - 1);

  const [sitios, mios, ultimoReciente, llegadas] = await Promise.all([
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
    db.attendance.findFirst({
      where: { staffId: staff.id, voidedAt: null, markedAt: { gte: new Date(Date.now() - VENTANA_MS) } },
      orderBy: { markedAt: "desc" },
      select: { kind: true },
    }),
    db.siteVisit.findMany({
      where: { staffId: staff.id, arrivedAt: { gte: desde, lte: hasta } },
      orderBy: { arrivedAt: "desc" },
      include: { site: { select: { name: true } } },
    }),
  ]);

  // Lo que le toca: salida si tiene una entrada abierta (tambien la de un
  // turno de noche que empezo ayer), jornada completa si hoy ya entro y
  // salio, y si no, entrada.
  const vigentesHoy = mios.filter((m) => !m.voidedAt);
  const siguiente: Siguiente =
    ultimoReciente?.kind === "ENTRADA"
      ? "SALIDA"
      : vigentesHoy.some((m) => m.kind === "ENTRADA")
        ? "COMPLETA"
        : "ENTRADA";

  // Con la zona del negocio, o en Vercel una entrada de las 8 a. m. se veria
  // como de la 1 p. m.
  const hora = (d: Date) =>
    d.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: user.timezone,
    });

  return (
    <>
      <PageHeader title="Marcar" subtitle={"Hola " + staff.name + ", esta es tu jornada de hoy"} />

      <div className="mx-auto grid w-full max-w-xl gap-4">
        <Card>
          <Marcador
            sitios={sitios}
            siguienteInicial={siguiente}
            cuenta={staff.id}
            seguimiento={{ activo: user.liveTracking && esPlanCompleto(user), consentido: Boolean(staff.locationConsentAt) }}
            llegadas={esPlanCompleto(user)}
          />
        </Card>

        {/* Lo otro que hace el empleado en el dia: avisar una novedad o
            mandar el reporte de lo que hizo. */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/panel/novedades"
            className="card-tight flex flex-col items-center gap-1.5 py-4 text-center transition-shadow hover:shadow-card-hover"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-warn-soft text-warn">
              <Icon name="bell" className="h-5 w-5" />
            </span>
            <span className="text-sm font-bold text-strong">Novedades</span>
            <span className="text-[11px] leading-snug text-muted">Permiso, incapacidad, llegada tarde</span>
          </Link>
          <Link
            href="/panel/informes"
            className="card-tight flex flex-col items-center gap-1.5 py-4 text-center transition-shadow hover:shadow-card-hover"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Icon name="image" className="h-5 w-5" />
            </span>
            <span className="text-sm font-bold text-strong">Hacer reporte</span>
            <span className="text-[11px] leading-snug text-muted">Con fotos, llega al administrador</span>
          </Link>
        </div>

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
                    <Icon name={m.kind === "ENTRADA" ? "arrowIn" : "arrowOut"} className="h-4 w-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        "block text-sm font-bold " + (m.voidedAt ? "text-subtle line-through" : "text-strong")
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
                      <span className="block text-[11px] text-bad">Anulado: {m.voidedReason}</span>
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

        {llegadas.length > 0 && (
          <Card>
            <h2 className="text-sm font-bold text-strong">Tus llegadas de hoy</h2>
            <ul className="mt-3 divide-y divide-line" data-llegadas>
              {llegadas.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Icon name="map" className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-strong">
                      {v.site?.name ?? v.place} · {hora(v.arrivedAt)}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {v.distanceM !== null
                        ? "a " + prettyDistancia(v.distanceM) + " del sitio"
                        : v.lat === null
                          ? "sin ubicación"
                          : "con ubicación"}
                      {v.note ? " · " + v.note : ""}
                    </span>
                  </span>
                  {v.lat !== null && v.lng !== null && (
                    <a href={enlaceMapa(v.lat, v.lng)} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                      Ver mapa
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
