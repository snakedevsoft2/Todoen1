import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isValidDay, todayIn } from "@/lib/dates";
import { buildSlots, isWorkDay, workDaysArray } from "@/lib/slots";
import { money, pretty12h, prettyDay } from "@/lib/format";
import { WEEKDAYS } from "@/lib/timezones";
import { Card, Empty, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { CopyLink } from "@/components/CopyLink";
import { NewAppointmentForm } from "@/components/NewAppointmentForm";
import { SubmitButton } from "@/components/SubmitButton";
import {
  closeAppointmentSaleAction,
  deleteAppointmentAction,
  setAppointmentStatusAction,
} from "@/actions/appointments";

export const dynamic = "force-dynamic";

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const user = await requireUser();
  if (user.businessType !== "BARBERIA") redirect("/panel");

  const params = await searchParams;
  const today = todayIn(user.timezone);
  const day = params.d && isValidDay(params.d) ? params.d : today;

  const [appointments, services] = await Promise.all([
    db.appointment.findMany({
      where: { userId: user.id, day },
      orderBy: { startTime: "asc" },
      include: { sale: { select: { id: true, total: true } } },
    }),
    db.service.findMany({
      where: { userId: user.id, active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, price: true, durationMin: true },
    }),
  ]);

  const slots = buildSlots(user);
  const busy = new Map(
    appointments.filter((a) => a.status !== "CANCELADO").map((a) => [a.startTime, a])
  );
  const active = appointments.filter((a) => a.status !== "CANCELADO");
  const attended = appointments.filter((a) => a.status === "ATENDIDO");
  const expected = active
    .filter((a) => a.status !== "NO_ASISTIO")
    .reduce((sum, a) => sum + (a.sale?.total ?? a.price), 0);
  const collected = attended.reduce((sum, a) => sum + (a.sale?.total ?? 0), 0);
  const openDay = isWorkDay(day, user.workDays);

  const workDayNames = workDaysArray(user.workDays)
    .map((d) => WEEKDAYS.find((w) => w.value === d)?.short ?? "")
    .join(", ");

  return (
    <>
      <PageHeader title="Turnos" subtitle={prettyDay(day)}>
        <div className="flex flex-wrap gap-2">
          <CopyLink path={"/reservar/" + user.slug} label="Copiar enlace de reservas" />
          <Link href={"/reservar/" + user.slug} target="_blank" className="btn-ghost btn-sm">
            <Icon name="link" className="h-4 w-4" />
            Abrir
          </Link>
        </div>
      </PageHeader>

      {/* Navegacion de dias */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={"/panel/turnos?d=" + addDays(day, -1)} className="btn-ghost btn-sm">
          Dia anterior
        </Link>
        <Link href="/panel/turnos" className="btn-ghost btn-sm">
          Hoy
        </Link>
        <Link href={"/panel/turnos?d=" + addDays(day, 1)} className="btn-ghost btn-sm">
          Dia siguiente
        </Link>
        <form className="ml-auto flex items-center gap-2" action="/panel/turnos">
          <input className="input max-w-[170px] py-1.5 text-sm" type="date" name="d" defaultValue={day} />
          <button className="btn-ghost btn-sm" type="submit">
            Ir
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cupos separados" value={String(active.length)} hint={"de " + slots.length + " horarios"} tone="brand" />
        <Stat label="Por atender" value={String(active.filter((a) => a.status === "PENDIENTE" || a.status === "CONFIRMADO").length)} />
        <Stat label="Cortes atendidos" value={String(attended.length)} tone="good" />
        <Stat
          label="Plata cobrada"
          value={money(collected, user.currency)}
          hint={"Esperado del dia " + money(expected, user.currency)}
          tone="good"
        />
      </div>

      {!openDay && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Este dia esta fuera de tu horario de atencion ({workDayNames}). Puedes agregar turnos a mano,
          pero los clientes no lo veran disponible.
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card
            title="Agenda del dia"
            subtitle={
              "Atiendes de " +
              pretty12h(String(user.openHour).padStart(2, "0") + ":00") +
              " a " +
              pretty12h(String(user.closeHour).padStart(2, "0") + ":00") +
              " cada " +
              user.slotMinutes +
              " minutos"
            }
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {slots.map((slot) => {
                const appointment = busy.get(slot);
                return (
                  <div
                    key={slot}
                    className={
                      "rounded-xl border px-3 py-2.5 text-left " +
                      (appointment
                        ? "border-brand-500/40 bg-brand-500/10"
                        : "border-dashed border-line bg-ink/40")
                    }
                  >
                    <p className="text-sm font-bold text-white">{pretty12h(slot)}</p>
                    {appointment ? (
                      <>
                        <p className="truncate text-xs font-medium text-brand-200">
                          {appointment.clientName}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">
                          {appointment.serviceName}
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-500">Libre</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Detalle de los turnos" subtitle="Hora, cliente, que se va a hacer y cierre de venta">
            {appointments.length === 0 ? (
              <Empty
                title="Nadie ha separado turno este dia"
                hint="Comparte tu enlace de reservas por WhatsApp para que te separen el cupo."
              />
            ) : (
              <ul className="space-y-3">
                {appointments.map((a) => (
                  <li key={a.id} className="rounded-xl border border-line bg-ink/50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-bold text-white">
                          <Icon name="clock" className="h-4 w-4 text-brand-300" />
                          {pretty12h(a.startTime)} a {pretty12h(a.endTime)}
                        </p>
                        <p className="mt-1 text-sm text-slate-200">{a.clientName}</p>
                        <p className="text-xs text-slate-400">
                          <Icon name="phone" className="mr-1 inline h-3 w-3" />
                          {a.clientPhone}
                        </p>
                        <p className="mt-1 text-sm text-brand-200">
                          {a.serviceName} - {money(a.price, user.currency)}
                        </p>
                        {a.notes && <p className="mt-1 text-xs italic text-slate-400">{a.notes}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={a.status} />
                        {a.sale && (
                          <span className="text-xs font-semibold text-emerald-300">
                            Cobrado {money(a.sale.total, user.currency)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line/60 pt-3">
                      {a.status === "PENDIENTE" && (
                        <form action={setAppointmentStatusAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="status" value="CONFIRMADO" />
                          <SubmitButton className="btn-ghost btn-sm" pendingText="...">
                            Confirmar
                          </SubmitButton>
                        </form>
                      )}

                      {!a.sale && a.status !== "CANCELADO" && (
                        <details className="w-full sm:w-auto">
                          <summary className="btn-success btn-sm cursor-pointer list-none">
                            Cerrar venta
                          </summary>
                          <form
                            action={closeAppointmentSaleAction}
                            className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-panel/80 p-3"
                          >
                            <input type="hidden" name="id" value={a.id} />
                            <label className="block">
                              <span className="label">Valor cobrado</span>
                              <input
                                className="input w-32"
                                type="number"
                                name="amount"
                                min={0}
                                step={1}
                                defaultValue={a.price}
                                required
                              />
                            </label>
                            <label className="block">
                              <span className="label">Pago</span>
                              <select className="input w-40" name="paymentMethod" defaultValue="EFECTIVO">
                                <option value="EFECTIVO">Efectivo</option>
                                <option value="TARJETA">Tarjeta</option>
                                <option value="TRANSFERENCIA">Transferencia</option>
                                <option value="OTRO">Otro</option>
                              </select>
                            </label>
                            <SubmitButton className="btn-success btn-sm" pendingText="Cerrando...">
                              Guardar venta
                            </SubmitButton>
                          </form>
                        </details>
                      )}

                      {a.status !== "CANCELADO" && !a.sale && (
                        <form action={setAppointmentStatusAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="status" value="NO_ASISTIO" />
                          <SubmitButton className="btn-ghost btn-sm" pendingText="...">
                            No asistio
                          </SubmitButton>
                        </form>
                      )}

                      {a.status !== "CANCELADO" && !a.sale && (
                        <form action={setAppointmentStatusAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="status" value="CANCELADO" />
                          <SubmitButton className="btn-danger btn-sm" pendingText="...">
                            Cancelar
                          </SubmitButton>
                        </form>
                      )}

                      <form action={deleteAppointmentAction} className="ml-auto">
                        <input type="hidden" name="id" value={a.id} />
                        <SubmitButton
                          className="btn-ghost btn-sm text-rose-300"
                          pendingText="..."
                          confirm="Borrar este turno de la agenda"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Agregar turno a mano" subtitle="Para el cliente que llega sin reservar">
            <NewAppointmentForm day={day} slots={slots} services={services} />
          </Card>

          <Card title="Tu enlace de reservas">
            <p className="break-all rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-xs text-slate-300">
              /reservar/{user.slug}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Mandalo por WhatsApp. El cliente elige el dia, la hora libre y el corte que quiere.
              {user.bookingOpen ? "" : " Ahora mismo tienes las reservas cerradas en Ajustes."}
            </p>
            <div className="mt-3">
              <CopyLink path={"/reservar/" + user.slug} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
