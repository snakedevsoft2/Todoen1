import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { prettyDay, shortDay } from "@/lib/format";
import { PageHeader, Card, Empty } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PatioBoard, type StaffOption, type WashJobRow } from "@/components/PatioBoard";
import { SubmitButton } from "@/components/SubmitButton";
import { FormSinSenal } from "@/components/SinSenal";
import { recibirDesdeReservaAction } from "@/actions/lavadero";
import { esDueno, esSupervisor } from "@/lib/permisos-empleado";
import { ESTADOS_PENDIENTES, entregaPorRecibir } from "@/lib/patio-turno";

export const dynamic = "force-dynamic";

export default async function PatioPage() {
  const { user, staff: me } = await requireSession();
  if (user.businessType !== "LAVADERO") redirect("/panel");
  if (!esDueno(me.role) && !esSupervisor(me.role)) redirect("/panel/mis-lavados");

  const today = todayIn(user.timezone);

  // Sin filtrar por dia: el carro que quedo sin entregar ayer sigue en el
  // patio hoy, y el jefe de patio que llega lo tiene que ver.
  const [jobs, lavadores, services, reservados, porRecibir] = await Promise.all([
    db.washJob.findMany({
      where: { userId: user.id, status: { in: ESTADOS_PENDIENTES } },
      orderBy: { createdAt: "asc" },
      include: { assignedStaff: { select: { id: true, name: true, color: true } } },
    }),
    db.staff.findMany({
      where: { userId: user.id, active: true, role: "VENDEDOR" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, color: true },
    }),
    db.service.findMany({
      where: { userId: user.id, active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, price: true },
    }),
    db.appointment.findMany({
      where: { userId: user.id, day: today, status: { in: ["PENDIENTE", "CONFIRMADO"] }, washJob: null },
      orderBy: { startTime: "asc" },
    }),
    entregaPorRecibir(user.id, me.id),
  ]);

  const rows: WashJobRow[] = jobs.map((j) => ({
    id: j.id,
    day: j.day,
    clientName: j.clientName,
    clientPhone: j.clientPhone,
    vehiclePlate: j.vehiclePlate,
    vehicleType: j.vehicleType,
    vehicleColor: j.vehicleColor,
    serviceName: j.serviceName,
    price: j.price,
    status: j.status as WashJobRow["status"],
    assignedStaffId: j.assignedStaff?.id ?? null,
    assignedStaffName: j.assignedStaff?.name ?? null,
    assignedStaffColor: j.assignedStaff?.color ?? null,
  }));

  const equipo: StaffOption[] = lavadores;

  return (
    <>
      <PageHeader title="Patio" subtitle={prettyDay(today)}>
        <Link href="/panel/patio/entrega" className="btn-ghost btn-sm">
          <Icon name="clock" className="h-4 w-4" />
          Entregar turno
        </Link>
      </PageHeader>

      {porRecibir && (
        <section className="mb-5 rounded-2xl border border-warn-line bg-warn-soft p-4">
          <p className="text-sm font-bold text-strong">
            {(porRecibir.fromStaff?.name ?? "El jefe de patio anterior") + " te entregó el patio"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {porRecibir.pendingCount === 0
              ? "Sin vehículos pendientes."
              : porRecibir.pendingCount === 1
                ? "Dejó 1 vehículo pendiente."
                : "Dejó " + porRecibir.pendingCount + " vehículos pendientes."}{" "}
            Revísala y confírmala.
          </p>
          <Link href="/panel/patio/entrega" className="btn-primary btn-sm mt-3">
            Ver la entrega
          </Link>
        </section>
      )}

      {reservados.length > 0 && (
        <Card className="mb-5" title="Reservados hoy" subtitle="Separados desde tu página pública">
          <ul className="space-y-2">
            {reservados.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-strong">
                    {a.startTime} · {a.clientName}
                  </p>
                  <p className="text-xs text-subtle">
                    {a.serviceName} · {shortDay(a.day)}
                  </p>
                </div>
                <FormSinSenal accion="recibirDesdeReservaAction" servidor={recibirDesdeReservaAction}>
                  <input type="hidden" name="appointmentId" value={a.id} />
                  <SubmitButton className="btn-primary btn-sm" pendingText="...">
                    Recibir
                  </SubmitButton>
                </FormSinSenal>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {equipo.length === 0 ? (
        <Empty title="Todavía no tienes lavadores" hint="Agrégalos desde Equipo para poder asignarles vehículos." />
      ) : (
        <PatioBoard jobs={rows} lavadores={equipo} services={services} currency={user.currency} today={today} />
      )}
    </>
  );
}
