/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import type { Staff, User } from "@prisma/client";
import type { NegocioSinImagenes, SessionStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, inicioDelDiaEn, todayIn } from "@/lib/dates";
import { prettyDay } from "@/lib/format";
import { duracionTexto, tramosDe } from "@/lib/jornada";
import { cubreDia, etiquetaNovedad } from "@/lib/novedades";
import { initials } from "@/lib/staff";
import { tourSteps } from "@/lib/tour";
import { Badge, Card, Empty, PageHeader, Stat } from "./ui";
import { GuiaInicial } from "./GuiaInicial";
import { Icon } from "./Icon";

/**
 * El resumen del dia del gestor de asistencia.
 *
 * Aqui nadie vende: el administrador abre la aplicacion para saber quien llego,
 * quien no, quien tiene permiso y que le mandaron. Nada de ventas ni de caja.
 */
export async function ResumenAsistencia({ user, staff }: { user: NegocioSinImagenes; staff: SessionStaff }) {
  const tz = user.timezone;
  const hoy = todayIn(tz);
  const desde = inicioDelDiaEn(hoy, tz);
  const hasta = inicioDelDiaEn(addDays(hoy, 1), tz);

  const [personal, conFoto, marcas, novedadesHoy, porRevisar, cuantasPorRevisar, reportesNuevos, cuantosReportes] =
    await Promise.all([
      db.staff.findMany({
        where: { userId: user.id, active: true, role: { not: "DUENO" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, color: true, updatedAt: true },
      }),
      db.staff.findMany({ where: { userId: user.id, photo: { not: null } }, select: { id: true } }),
      db.attendance.findMany({
        where: { userId: user.id, voidedAt: null, markedAt: { gte: desde, lt: hasta } },
        orderBy: { markedAt: "asc" },
        select: { staffId: true, kind: true, markedAt: true, voidedAt: true, site: { select: { name: true } } },
      }),
      db.novelty.findMany({
        where: { userId: user.id, status: "APROBADA", fromDay: { lte: hoy }, toDay: { gte: hoy } },
        select: { staffId: true, kind: true, fromDay: true, toDay: true },
      }),
      db.novelty.findMany({
        where: { userId: user.id, status: "PENDIENTE" },
        orderBy: { createdAt: "asc" },
        take: 5,
        select: { id: true, kind: true, fromDay: true, toDay: true, staff: { select: { name: true } } },
      }),
      db.novelty.count({ where: { userId: user.id, status: "PENDIENTE" } }),
      db.visitReport.findMany({
        where: { userId: user.id, sentAt: { not: null }, seenAt: null, NOT: { createdByStaffId: staff.id } },
        orderBy: { sentAt: "desc" },
        take: 5,
        select: { id: true, title: true, day: true, createdByStaffId: true, _count: { select: { photos: true } } },
      }),
      db.visitReport.count({
        where: { userId: user.id, sentAt: { not: null }, seenAt: null, NOT: { createdByStaffId: staff.id } },
      }),
    ]);

  const fotos = new Set(conFoto.map((f) => f.id));
  const nombres = new Map(personal.map((p) => [p.id, p.name]));
  const ahora = new Date();
  const hora = (d: Date) =>
    d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: tz });

  const hoyPorPersona = personal.map((p) => {
    const suyas = marcas.filter((m) => m.staffId === p.id);
    const ultima = suyas[suyas.length - 1];
    const novedad = novedadesHoy.find((n) => n.staffId === p.id && cubreDia(n, hoy));
    const { totalMs } = tramosDe(suyas, ahora);
    const estado = !ultima ? (novedad ? "novedad" : "sin marcar") : ultima.kind === "ENTRADA" ? "adentro" : "salio";
    return { p, suyas, ultima, novedad, totalMs, estado };
  });

  const adentro = hoyPorPersona.filter((x) => x.estado === "adentro").length;
  const sinMarcar = hoyPorPersona.filter((x) => x.estado === "sin marcar").length;
  const conNovedad = hoyPorPersona.filter((x) => x.novedad).length;

  return (
    <>
      {staff.onboardingDoneAt && !staff.tourDoneAt && (
        <GuiaInicial steps={tourSteps(user.businessType)} businessName={user.businessName} personName={staff.name} />
      )}

      <PageHeader title="Resumen del día" subtitle={prettyDay(hoy) + " - Gestor de asistencia"}>
        <div className="flex flex-wrap gap-2">
          <Link href="/panel/planilla" className="btn-primary btn-sm">
            <Icon name="table" className="h-4 w-4" />
            Ver planilla
          </Link>
          <Link href="/panel/planilla?r=semana" className="btn-ghost btn-sm">
            <Icon name="clock" className="h-4 w-4" />
            Horas de la semana
          </Link>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Adentro ahora" value={String(adentro)} hint={"De " + personal.length + " personas"} tone="good" />
        <Stat label="Sin marcar hoy" value={String(sinMarcar)} hint="Sin novedad aprobada" tone={sinMarcar > 0 ? "amber" : "default"} />
        <Stat label="Con novedad hoy" value={String(conNovedad)} hint="Permisos e incapacidades" />
        <Stat
          label="Por revisar"
          value={String(cuantasPorRevisar + cuantosReportes)}
          hint={
            cuantasPorRevisar +
            (cuantasPorRevisar === 1 ? " novedad · " : " novedades · ") +
            cuantosReportes +
            (cuantosReportes === 1 ? " reporte" : " reportes")
          }
          tone={cuantasPorRevisar + cuantosReportes > 0 ? "amber" : "default"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Tu personal hoy" subtitle="Quién llegó, quién salió y quién falta">
          {personal.length === 0 ? (
            <Empty title="Todavía no tienes personal" hint="Agrégalo en Personal, con su correo y su clave, para que marque desde su teléfono." />
          ) : (
            <ul className="divide-y divide-line">
              {hoyPorPersona.map(({ p, suyas, ultima, novedad, totalMs, estado }) => (
                <li key={p.id} data-persona={p.id} className="flex items-center gap-3 py-2.5">
                  {fotos.has(p.id) ? (
                    <img src={"/foto-perfil/" + p.id + "?v=" + p.updatedAt.getTime()} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: p.color }}>
                      {initials(p.name)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-strong">{p.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {estado === "adentro" && ultima
                        ? "Entró " + hora(ultima.markedAt) + (ultima.site ? " · " + ultima.site.name : "") + " · lleva " + duracionTexto(totalMs)
                        : estado === "salio"
                          ? "Entró " + hora(suyas[0].markedAt) + " · salió " + hora(ultima!.markedAt) + " · " + duracionTexto(totalMs)
                          : novedad
                            ? etiquetaNovedad(novedad.kind) + " aprobada"
                            : "Todavía no marca entrada"}
                    </span>
                  </span>
                  <Badge tone={estado === "adentro" ? "green" : estado === "salio" ? "slate" : estado === "novedad" ? "blue" : "amber"}>
                    {estado === "adentro" ? "Adentro" : estado === "salio" ? "Salió" : estado === "novedad" ? "Novedad" : "Sin marcar"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card
            title="Reportes nuevos"
            action={
              <Link href="/panel/informes" className="text-[13px] font-semibold text-brand-700 hover:underline">
                Ver todos
              </Link>
            }
          >
            {reportesNuevos.length === 0 ? (
              <p className="text-sm text-muted">No hay reportes nuevos del personal.</p>
            ) : (
              <ul className="divide-y divide-line" data-reportes-nuevos>
                {reportesNuevos.map((r) => (
                  <li key={r.id}>
                    <Link href={"/panel/informes/" + r.id} className="flex items-center gap-2 py-2.5 hover:underline">
                      <Icon name="image" className="h-4 w-4 shrink-0 text-brand-600" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-strong">{r.title}</span>
                      <span className="shrink-0 text-[11px] text-muted">
                        {(r.createdByStaffId && nombres.get(r.createdByStaffId)) ?? ""} · {r._count.photos} fotos
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Novedades por revisar"
            action={
              <Link href="/panel/novedades" className="text-[13px] font-semibold text-brand-700 hover:underline">
                Revisar
              </Link>
            }
          >
            {porRevisar.length === 0 ? (
              <p className="text-sm text-muted">No hay novedades pendientes.</p>
            ) : (
              <ul className="divide-y divide-line" data-novedades-por-revisar>
                {porRevisar.map((n) => (
                  <li key={n.id} className="flex items-center gap-2 py-2.5 text-sm">
                    <span className="font-semibold text-strong">{n.staff.name}</span>
                    <span className="text-muted">{etiquetaNovedad(n.kind)}</span>
                    <span className="ml-auto text-[11px] text-muted">
                      {n.fromDay === n.toDay ? prettyDay(n.fromDay) : prettyDay(n.fromDay) + " al " + prettyDay(n.toDay)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
