import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { startOfMonth, todayIn } from "@/lib/dates";
import { prettyDay } from "@/lib/format";
import { ESTADOS_NOVEDAD, cubreDia, etiquetaNovedad } from "@/lib/novedades";
import { revisarNovedadAction } from "@/actions/novedades";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { NovedadForm } from "@/components/NovedadForm";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

type Fila = {
  id: string;
  kind: string;
  fromDay: string;
  toDay: string;
  fromTime: string | null;
  toTime: string | null;
  reason: string;
  status: string;
  reviewNote: string | null;
  createdAt: Date;
  staff?: { name: string };
};

function cuando(n: Fila): string {
  const dias = n.fromDay === n.toDay ? prettyDay(n.fromDay) : prettyDay(n.fromDay) + " al " + prettyDay(n.toDay);
  const horas = n.fromTime ? " · " + n.fromTime + (n.toTime ? " a " + n.toTime : "") : "";
  return dias + horas;
}

function Detalle({ n, conSoporte, conNombre }: { n: Fila; conSoporte: boolean; conNombre: boolean }) {
  const estado = ESTADOS_NOVEDAD[n.status] ?? ESTADOS_NOVEDAD.PENDIENTE;
  return (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-2">
        {conNombre && n.staff && <span className="text-sm font-bold text-strong">{n.staff.name}</span>}
        <span className="text-sm font-semibold text-body">{etiquetaNovedad(n.kind)}</span>
        <Badge tone={estado.tone}>{estado.label}</Badge>
      </p>
      <p className="mt-0.5 text-[12px] text-muted">{cuando(n)}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-body [overflow-wrap:anywhere]">{n.reason}</p>
      {conSoporte && (
        <a href={"/foto-novedad/" + n.id} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:underline">
          <Icon name="image" className="h-3.5 w-3.5" />
          Ver soporte
        </a>
      )}
      {n.reviewNote && <p className="mt-1 text-[12px] italic text-muted">Nota del administrador: {n.reviewNote}</p>}
    </div>
  );
}

export default async function NovedadesPage() {
  const { user, staff } = await requireSession();
  const esDueno = staff.role === "DUENO";
  const hoy = todayIn(user.timezone);

  const select = {
    id: true,
    kind: true,
    fromDay: true,
    toDay: true,
    fromTime: true,
    toTime: true,
    reason: true,
    status: true,
    reviewNote: true,
    createdAt: true,
    staff: { select: { name: true } },
  } as const;

  if (!esDueno) {
    const [mias, conFoto] = await Promise.all([
      db.novelty.findMany({ where: { userId: user.id, staffId: staff.id }, orderBy: { createdAt: "desc" }, take: 50, select }),
      db.novelty.findMany({ where: { userId: user.id, staffId: staff.id, photo: { not: null } }, select: { id: true } }),
    ]);
    const fotos = new Set(conFoto.map((f) => f.id));

    return (
      <>
        <PageHeader title="Novedades" subtitle="Avísale al administrador un permiso, una incapacidad o una llegada tarde" />
        <div className="mx-auto grid w-full max-w-3xl gap-4">
          <Card title="Avisar una novedad">
            <NovedadForm hoy={hoy} />
          </Card>
          <Card title="Lo que has avisado">
            {mias.length === 0 ? (
              <p className="text-sm text-muted">Todavía no has avisado ninguna novedad.</p>
            ) : (
              <ul className="divide-y divide-line">
                {mias.map((n) => (
                  <li key={n.id} data-novedad={n.id} className="py-3">
                    <Detalle n={n} conSoporte={fotos.has(n.id)} conNombre={false} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </>
    );
  }

  const [pendientes, revisadas, conFoto, aprobadasMes] = await Promise.all([
    db.novelty.findMany({ where: { userId: user.id, status: "PENDIENTE" }, orderBy: { createdAt: "asc" }, take: 100, select }),
    db.novelty.findMany({ where: { userId: user.id, status: { not: "PENDIENTE" } }, orderBy: { reviewedAt: "desc" }, take: 30, select }),
    db.novelty.findMany({ where: { userId: user.id, photo: { not: null } }, select: { id: true }, orderBy: { createdAt: "desc" }, take: 500 }),
    db.novelty.findMany({
      where: { userId: user.id, status: "APROBADA", toDay: { gte: startOfMonth(hoy) } },
      select: { fromDay: true, toDay: true },
    }),
  ]);
  const fotos = new Set(conFoto.map((f) => f.id));
  const hoyConNovedad = aprobadasMes.filter((n) => cubreDia(n, hoy)).length;

  return (
    <>
      <PageHeader title="Novedades" subtitle="Los permisos, incapacidades y avisos de tu personal">
        <Link href="/panel/planilla" className="btn-ghost btn-sm">
          <Icon name="table" className="h-4 w-4" />
          Ver planilla
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Por revisar" value={String(pendientes.length)} tone={pendientes.length > 0 ? "amber" : "default"} />
        <Stat label="Con novedad hoy" value={String(hoyConNovedad)} hint="Aprobadas que cubren hoy" />
        <Stat label="Aprobadas este mes" value={String(aprobadasMes.length)} tone="good" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Por revisar" subtitle="Aprueba o rechaza. Puedes dejarle una nota.">
          {pendientes.length === 0 ? (
            <Empty title="No hay novedades por revisar" hint="Cuando alguien del personal avise algo, aparece aquí." />
          ) : (
            <ul className="divide-y divide-line">
              {pendientes.map((n) => (
                <li key={n.id} data-novedad={n.id} className="py-3">
                  <Detalle n={n} conSoporte={fotos.has(n.id)} conNombre />
                  <form action={revisarNovedadAction.bind(null, "APROBADA")} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={n.id} />
                    <input className="input h-9 min-w-0 flex-1 basis-40 py-1 text-sm" name="note" maxLength={200} placeholder="Nota (opcional)" aria-label="Nota para el empleado" />
                    <button type="submit" className="btn-success btn-sm">
                      Aprobar
                    </button>
                    <button type="submit" formAction={revisarNovedadAction.bind(null, "RECHAZADA")} className="btn-ghost btn-sm text-bad">
                      Rechazar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Revisadas" subtitle="Las últimas 30">
          {revisadas.length === 0 ? (
            <p className="text-sm text-muted">Todavía no has revisado ninguna.</p>
          ) : (
            <ul className="divide-y divide-line">
              {revisadas.map((n) => (
                <li key={n.id} className="py-3">
                  <Detalle n={n} conSoporte={fotos.has(n.id)} conNombre />
                  <form
                    action={revisarNovedadAction.bind(null, n.status === "APROBADA" ? "RECHAZADA" : "APROBADA")}
                    className="mt-1.5"
                  >
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      type="submit"
                      className="text-[12px] font-semibold text-muted hover:text-strong hover:underline"
                    >
                      {n.status === "APROBADA" ? "Cambiar a rechazada" : "Cambiar a aprobada"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
