import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { money, prettyDay } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { FormSinSenal } from "@/components/SinSenal";
import { marcarListoAction } from "@/actions/lavadero";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const ESTADO_LABEL: Record<string, string> = {
  EN_COLA: "En cola",
  LAVANDO: "Lavando",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
};
const ESTADO_TONO: Record<string, "amber" | "blue" | "green"> = {
  EN_COLA: "amber",
  LAVANDO: "blue",
  LISTO: "blue",
  ENTREGADO: "green",
};

/**
 * Lo unico que ve el lavador: los vehiculos que le asigno el jefe de patio
 * hoy, cuanto tiempo toma cada uno y cuanto gana por cada uno. Nada del
 * negocio completo (eso lo resuelve el menu fijo en lib/permisos.ts).
 */
export default async function MisLavadosPage() {
  const { user, staff } = await requireSession({ lavadorOk: true });
  if (user.businessType !== "LAVADERO") redirect("/panel");

  const today = todayIn(user.timezone);
  const jobs = await db.washJob.findMany({
    where: { userId: user.id, day: today, assignedStaffId: staff.id, status: { not: "CANCELADO" } },
    orderBy: { createdAt: "asc" },
    include: { service: { select: { durationMin: true } } },
  });

  const ganancia = (precio: number) => Math.round((precio * staff.commissionPct) / 100);
  const conComision = staff.commissionPct > 0;
  const ganadoHoy = jobs
    .filter((j) => j.status === "ENTREGADO")
    .reduce((sum, j) => sum + ganancia(j.price), 0);

  return (
    <>
      <PageHeader title="Mis lavados" subtitle={prettyDay(today)} />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="card-tight">
          <p className="eyebrow">Vehículos hoy</p>
          <p className="mt-2.5 stat-value text-strong">{jobs.length}</p>
        </div>
        {conComision && (
          <div className="card-tight">
            <p className="eyebrow">Ganado hoy</p>
            <p className="mt-2.5 stat-value text-strong">{money(ganadoHoy, user.currency)}</p>
          </div>
        )}
      </div>

      <Card title="Vehículos asignados">
        {jobs.length === 0 ? (
          <Empty
            title="Todavía no tienes vehículos asignados"
            hint="El jefe de patio te los va asignando a medida que llegan."
          />
        ) : (
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-strong">
                      {[job.vehiclePlate, job.vehicleType, job.vehicleColor].filter(Boolean).join(" · ") ||
                        job.clientName}
                    </p>
                    <p className="text-xs text-muted">
                      {job.serviceName}
                      {job.service?.durationMin ? " · " + job.service.durationMin + " min aprox." : ""}
                    </p>
                  </div>
                  <Badge tone={ESTADO_TONO[job.status] ?? "amber"}>{ESTADO_LABEL[job.status] ?? job.status}</Badge>
                </div>

                {conComision && (
                  <p className="mt-1 text-xs text-subtle">
                    Ganas {money(ganancia(job.price), user.currency)} por este
                  </p>
                )}

                {job.status === "LAVANDO" && (
                  <FormSinSenal accion="marcarListoAction" servidor={marcarListoAction} className="mt-2">
                    <input type="hidden" name="washJobId" value={job.id} />
                    <SubmitButton className="btn-primary btn-sm" pendingText="...">
                      Ya terminé
                    </SubmitButton>
                  </FormSinSenal>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
