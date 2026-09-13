import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  addDays,
  dayIn,
  dayRange,
  inicioDelDiaEn,
  isoWeekday,
  startOfMonth,
  todayIn,
} from "@/lib/dates";
import { prettyDay } from "@/lib/format";
import { enElSitio, enlaceMapa, prettyDistancia } from "@/lib/geo";
import { duracionTexto, tramosDe } from "@/lib/jornada";
import type { PlanillaDatos } from "@/lib/informe-pdf";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { AnularMarcaje } from "@/components/AnularMarcaje";
import { AccionesPlanilla } from "@/components/CompartirPdf";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

type Rango = "dia" | "semana" | "mes";

/** Primer y ultimo dia (inclusive) del periodo que contiene a `dia`. */
function limites(dia: string, rango: Rango): { desde: string; hasta: string } {
  if (rango === "semana") {
    const lunes = addDays(dia, 1 - isoWeekday(dia));
    return { desde: lunes, hasta: addDays(lunes, 6) };
  }
  if (rango === "mes") {
    const inicio = startOfMonth(dia);
    const siguiente = startOfMonth(addDays(inicio, 32));
    return { desde: inicio, hasta: addDays(siguiente, -1) };
  }
  return { desde: dia, hasta: dia };
}

export default async function PlanillaPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; r?: string }>;
}) {
  const { user } = await requireOwner();
  const params = await searchParams;
  const tz = user.timezone;

  const hoy = todayIn(tz);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(params.d ?? "") ? (params.d as string) : hoy;
  const rango: Rango = params.r === "semana" || params.r === "mes" ? params.r : "dia";
  const { desde, hasta } = limites(dia, rango);

  // Limites en la zona del NEGOCIO. En Vercel el servidor esta en UTC: con
  // medianoche del servidor, lo marcado despues de las 7 p. m. en Bogota se
  // iria al dia siguiente.
  const inicio = inicioDelDiaEn(desde < dia ? desde : dia, tz);
  const fin = inicioDelDiaEn(addDays(hasta > dia ? hasta : dia, 1), tz);

  const [personal, marcajes] = await Promise.all([
    db.staff.findMany({
      where: { userId: user.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.attendance.findMany({
      where: { userId: user.id, markedAt: { gte: inicio, lt: fin } },
      orderBy: { markedAt: "asc" },
      include: {
        site: { select: { name: true, radiusM: true } },
        staff: { select: { name: true } },
      },
    }),
  ]);

  const hora = (d: Date) =>
    d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: tz });
  const diaDe = (d: Date) => dayIn(d, tz);
  const lejosDe = (m: (typeof marcajes)[number]) =>
    Boolean(m.site && enElSitio(m.distanceM, m.site.radiusM, m.accuracyM) === false);

  // ---------------------------------------------------------- vista del dia
  const delDia = marcajes.filter((m) => diaDe(m.markedAt) === dia);
  const vigentesDia = delDia.filter((m) => !m.voidedAt);
  const ahora = dia === hoy ? new Date() : null;

  const jornadas = personal.map((p) => {
    const suyos = delDia.filter((m) => m.staffId === p.id);
    const vig = suyos.filter((m) => !m.voidedAt);
    const { totalMs, tramos } = tramosDe(vig, ahora);
    const ultimo = vig[vig.length - 1];
    const estado = !ultimo ? "sin marcar" : ultimo.kind === "ENTRADA" ? "adentro" : "salio";
    return { persona: p, suyos, totalMs, estado, raro: tramos.some((t) => t.raro) };
  });

  const adentro = jornadas.filter((j) => j.estado === "adentro").length;
  const sinMarcar = jornadas.filter((j) => j.estado === "sin marcar").length;
  const lejos = vigentesDia.filter(lejosDe).length;

  // -------------------------------------------------- planilla para exportar
  const enRango = marcajes.filter((m) => {
    const d = diaDe(m.markedAt);
    return d >= desde && d <= hasta;
  });
  const filas: PlanillaDatos["filas"] = [];
  const totales: PlanillaDatos["totales"] = [];

  for (const p of personal) {
    let totalPersona = 0;
    let dias = 0;
    for (const d of dayRange(desde, hasta)) {
      const suyos = enRango.filter((m) => m.staffId === p.id && !m.voidedAt && diaDe(m.markedAt) === d);
      if (suyos.length === 0) continue;
      const { totalMs, tramos } = tramosDe(suyos, d === hoy ? new Date() : null);
      totalPersona += totalMs;
      dias += 1;
      filas.push({
        persona: p.name,
        dia: prettyDay(d),
        entradas: suyos.filter((m) => m.kind === "ENTRADA").map((m) => hora(m.markedAt)).join(", "),
        salidas: suyos.filter((m) => m.kind === "SALIDA").map((m) => hora(m.markedAt)).join(", "),
        horas: duracionTexto(totalMs),
        sitio: Array.from(new Set(suyos.map((m) => m.site?.name ?? "Sin sitio"))).join(", "),
        lejos: suyos.some(lejosDe),
        raro: tramos.some((t) => t.raro),
      });
    }
    if (dias > 0) totales.push({ persona: p.name, dias, horas: duracionTexto(totalPersona) });
  }

  const textoRango = rango === "dia" ? prettyDay(desde) : prettyDay(desde) + " al " + prettyDay(hasta);

  const planilla: PlanillaDatos = {
    businessName: user.businessName,
    rango: textoRango,
    filas,
    totales,
    anulados: enRango
      .filter((m) => m.voidedAt)
      .map((m) => ({
        persona: m.staff.name,
        dia: prettyDay(diaDe(m.markedAt)),
        hora: hora(m.markedAt),
        tipo: m.kind === "ENTRADA" ? "Entrada" : "Salida",
        motivo: m.voidedReason ?? "",
      })),
  };

  const enlaceRango = (r: Rango) => "/panel/planilla?d=" + dia + (r === "dia" ? "" : "&r=" + r);

  return (
    <>
      <PageHeader title="Planilla" subtitle={dia === hoy ? "Hoy" : prettyDay(dia)}>
        <form className="flex items-center gap-2">
          <input className="input w-auto" type="date" name="d" defaultValue={dia} />
          {rango !== "dia" && <input type="hidden" name="r" value={rango} />}
          <button type="submit" className="btn-ghost btn-sm">
            Ir
          </button>
        </form>
      </PageHeader>

      <div className="animate-lista grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Adentro ahora" value={String(adentro)} hint="Marcaron y no han salido" tone="good" />
        <Stat
          label="Sin marcar"
          value={String(sinMarcar)}
          hint={"De " + personal.length + " personas"}
          tone={sinMarcar > 0 ? "amber" : "good"}
        />
        <Stat label="Marcajes del día" value={String(vigentesDia.length)} />
        <Stat
          label="Lejos del sitio"
          value={String(lejos)}
          hint="Marcaron fuera del radio"
          tone={lejos > 0 ? "bad" : "good"}
        />
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-strong">Exportar planilla</h2>
            <p className="text-[12px] text-muted">
              {textoRango} · {totales.length} {totales.length === 1 ? "persona" : "personas"}
            </p>
          </div>
          <div className="flex gap-1.5">
            {(["dia", "semana", "mes"] as Rango[]).map((r) => (
              <Link
                key={r}
                href={enlaceRango(r)}
                className={rango === r ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
              >
                {r === "dia" ? "Día" : r === "semana" ? "Semana" : "Mes"}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <AccionesPlanilla datos={planilla} />
        </div>
      </Card>

      {personal.length === 0 ? (
        <Card className="mt-5">
          <Empty
            title="Todavía no tienes personal"
            hint="Agrega a tu gente en Personal. Cada quien entra con su usuario y marca desde su teléfono."
          />
        </Card>
      ) : (
        <ul className="animate-lista mt-5 space-y-3">
          {jornadas.map(({ persona, suyos, totalMs, estado, raro }) => (
            <li key={persona.id} className="card-tight">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-strong">{persona.name}</span>
                  <span className="block text-[11px] text-muted">
                    {estado === "sin marcar"
                      ? "No ha marcado"
                      : estado === "adentro"
                        ? "Adentro · lleva " + duracionTexto(totalMs)
                        : "Salió · " + duracionTexto(totalMs)}
                    {raro && <span className="text-warn"> · hay un marcaje sin su pareja</span>}
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
                    const dentro = m.site ? enElSitio(m.distanceM, m.site.radiusM, m.accuracyM) : null;
                    return (
                      <li key={m.id} className="flex flex-wrap items-center gap-2.5 py-2">
                        <Icon
                          name={m.kind === "ENTRADA" ? "arrowIn" : "arrowOut"}
                          className={
                            "h-4 w-4 shrink-0 " + (m.kind === "ENTRADA" ? "text-good" : "text-brand-600")
                          }
                        />
                        <span
                          className={
                            "text-[13px] font-bold " + (m.voidedAt ? "text-subtle line-through" : "text-strong")
                          }
                        >
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
                          {m.receivedAt.getTime() - m.markedAt.getTime() > 120000 && " · marcado sin señal"}
                          {m.voidedAt && <span className="text-bad"> · anulado: {m.voidedReason}</span>}
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

                        {!m.voidedAt && <AnularMarcaje id={m.id} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-[11px] text-muted">
        Un marcaje anulado no se borra: queda tachado con su motivo, aquí y en el PDF. Es lo que hace
        que la planilla sirva como prueba.
      </p>
    </>
  );
}
