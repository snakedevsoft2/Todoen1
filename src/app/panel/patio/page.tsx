import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { prettyDay } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PatioBoard, type ReservaPatio, type StaffOption, type WashJobRow } from "@/components/PatioBoard";
import { esDueno, esSupervisor, puedeAsignarleCarro, ROLES_QUE_LAVAN } from "@/lib/permisos-empleado";
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
      where: { userId: user.id, active: true, role: { in: ROLES_QUE_LAVAN } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, color: true, role: true },
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
    fromReserva: Boolean(j.appointmentId),
  }));

  // Los lavadores y los otros jefes de patio: el que esta mirando no sale, no
  // se asigna carros a si mismo (ver puedeAsignarleCarro).
  const equipo: StaffOption[] = lavadores
    .filter((l) => puedeAsignarleCarro(me, l))
    .map((l) => ({ id: l.id, name: l.name, color: l.color }));
  const reservas: ReservaPatio[] = reservados.map((a) => ({
    id: a.id,
    day: a.day,
    startTime: a.startTime,
    clientName: a.clientName,
    clientPhone: a.clientPhone,
    serviceId: a.serviceId,
    serviceName: a.serviceName,
  }));

  return (
    <>
      <PageHeader title="Patio" subtitle={prettyDay(today)}>
        {/* Todos los vehiculos, tambien los ya cobrados, para corregirlos o borrarlos: solo la dueña. */}
        {esDueno(me.role) && (
          <Link href="/panel/patio/historial" className="btn-ghost btn-sm">
            <Icon name="search" className="h-4 w-4" />
            Historial
          </Link>
        )}
        {/* El jefe de patio tambien lava: ahi ve los carros que le asignaron y lo que gana. */}
        {esSupervisor(me.role) && (
          <Link href="/panel/mis-lavados" className="btn-ghost btn-sm">
            <Icon name="car" className="h-4 w-4" />
            Mis lavados
          </Link>
        )}
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

      <PatioBoard
        jobs={rows}
        lavadores={equipo}
        services={services}
        reservados={reservas}
        currency={user.currency}
        timezone={user.timezone}
        today={today}
      />
    </>
  );
}
