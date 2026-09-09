import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { remindersForTomorrow } from "@/lib/reminders";
import { ReminderList } from "@/components/ReminderList";
import { db } from "@/lib/db";
import { addDays, isValidDay, todayIn } from "@/lib/dates";
import { buildSlots, isWorkDay, workDaysArray } from "@/lib/slots";
import { money, pretty12h, prettyDay } from "@/lib/format";
import { confirmMessage, toInternational, waLink } from "@/lib/whatsapp";
import { WEEKDAYS } from "@/lib/timezones";
import { Card, Empty, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { CopyLink } from "@/components/CopyLink";
import { NewAppointmentForm } from "@/components/NewAppointmentForm";
import { StaffDot } from "@/components/StaffForms";
import { SubmitButton } from "@/components/SubmitButton";
import {
  closeAppointmentSaleAction,
  deleteAppointmentAction,
  setAppointmentStaffAction,
  setAppointmentStatusAction,
} from "@/actions/appointments";

export const dynamic = "force-dynamic";

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; s?: string }>;
}) {
  const { user, staff: me } = await requireSession();
  if (user.businessType !== "BARBERIA") redirect("/panel");

  const params = await searchParams;
  const today = todayIn(user.timezone);
  const day = params.d && isValidDay(params.d) ? params.d : today;

  const [team, appointments, services, recordatorios] = await Promise.all([
    db.staff.findMany({
      where: { userId: user.id, active: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, color: true, role: true },
    }),
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
    remindersForTomorrow(user.id, user.timezone),
  ]);

  // Filtro por barbero. Sin filtro se ve la agenda completa de la barberia.
  const filterId = params.s && team.some((t) => t.id === params.s) ? params.s : "";
  const visible = filterId ? appointments.filter((a) => a.staffId === filterId) : appointments;
  const columns = filterId ? team.filter((t) => t.id === filterId) : team;
  const varios = team.length > 1;

  const slots = buildSlots(user);
  // Un turno por barbero y por hora: la llave junta a los dos.
  const busy = new Map(
    appointments
      .filter((a) => a.status !== "CANCELADO")
      .map((a) => [(a.staffId ?? "sin") + "|" + a.startTime, a])
  );

  const active = visible.filter((a) => a.status !== "CANCELADO");
  const attended = visible.filter((a) => a.status === "ATENDIDO");
  const expected = active
    .filter((a) => a.status !== "NO_ASISTIO")
    .reduce((sum, a) => sum + (a.sale?.total ?? a.price), 0);
  const collected = attended.reduce((sum, a) => sum + (a.sale?.total ?? 0), 0);
  const openDay = isWorkDay(day, user.workDays);

  const colorOf = new Map(team.map((t) => [t.id, t.color]));

  // Medicion del dia, barbero por barbero.
  const perStaff = team.map((person) => {
    const suyos = appointments.filter((a) => a.staffId === person.id && a.status !== "CANCELADO");
    const atendidos = suyos.filter((a) => a.status === "ATENDIDO");
    return {
      ...person,
      total: suyos.length,
      attended: atendidos.length,
      collected: atendidos.reduce((sum, a) => sum + (a.sale?.total ?? 0), 0),
      pending: suyos.filter((a) => a.status === "PENDIENTE" || a.status === "CONFIRMADO").length,
    };
  });

  const sinBarbero = appointments.filter((a) => !a.staffId && a.status !== "CANCELADO").length;

  const workDayNames = workDaysArray(user.workDays)
    .map((d) => WEEKDAYS.find((w) => w.value === d)?.short ?? "")
    .join(", ");

  const dayLink = (extra: Record<string, string>) => {
    const query = new URLSearchParams({ d: day, ...(filterId ? { s: filterId } : {}), ...extra });
    return "/panel/turnos?" + query.toString();
  };

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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={dayLink({ d: addDays(day, -1) })} className="btn-ghost btn-sm">
          Dia anterior
        </Link>
        <Link href={dayLink({ d: today })} className="btn-ghost btn-sm">
          Hoy
        </Link>
        <Link href={dayLink({ d: addDays(day, 1) })} className="btn-ghost btn-sm">
          Dia siguiente
        </Link>
        <form className="ml-auto flex items-center gap-2" action="/panel/turnos">
          {filterId && <input type="hidden" name="s" value={filterId} />}
          <input className="input max-w-[170px] py-1.5 text-sm" type="date" name="d" defaultValue={day} />
          <button className="btn-ghost btn-sm" type="submit">
            Ir
          </button>
        </form>
      </div>

      {/* Filtro por barbero */}
      {varios && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Barbero</span>
          <Link
            href={"/panel/turnos?d=" + day}
            className={"btn-ghost btn-sm " + (filterId ? "" : "border-brand-500 text-brand-700")}
          >
            Todos
          </Link>
          {team.map((person) => (
            <Link
              key={person.id}
              href={"/panel/turnos?d=" + day + "&s=" + person.id}
              className={
                "btn-ghost btn-sm " + (filterId === person.id ? "border-brand-500 text-brand-700" : "")
              }
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: person.color }}
              />
              {person.name}
              {person.id === me.id ? " (tu)" : ""}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Cupos separados"
          value={String(active.length)}
          hint={"de " + slots.length * Math.max(1, columns.length) + " horarios"}
          tone="brand"
        />
        <Stat
          label="Por atender"
          value={String(
            active.filter((a) => a.status === "PENDIENTE" || a.status === "CONFIRMADO").length
          )}
        />
        <Stat label="Cortes atendidos" value={String(attended.length)} tone="good" />
        <Stat
          label="Plata cobrada"
          value={money(collected, user.currency)}
          hint={"Esperado del dia " + money(expected, user.currency)}
          tone="good"
        />
      </div>

      {/* Medicion del dia por barbero */}
      {varios && !filterId && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {perStaff.map((person) => (
            <div key={person.id} className="card-tight flex items-center gap-3">
              <StaffDot name={person.name} color={person.color} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-strong">
                  {person.name}
                  {person.id === me.id && (
                    <span className="ml-1 text-[11px] font-normal text-brand-600">(tu)</span>
                  )}
                </p>
                <p className="text-[11px] text-subtle">
                  {person.total} turnos - {person.attended} atendidos - {person.pending} por atender
                </p>
              </div>
              <p className="text-sm font-bold text-good">{money(person.collected, user.currency)}</p>
            </div>
          ))}
        </div>
      )}

      {!openDay && (
        <div className="mt-4 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">
          Este dia esta fuera de tu horario de atencion ({workDayNames}). Puedes agregar turnos a mano,
          pero los clientes no lo veran disponible.
        </div>
      )}

      {sinBarbero > 0 && (
        <div className="mt-4 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">
          Hay {sinBarbero} turno{sinBarbero === 1 ? "" : "s"} sin barbero asignado. Abajo, en cada
          turno, usa &quot;Pasar a otro barbero&quot; para decidir quien atiende.
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
            {columns.length > 1 ? (
              // Una columna por barbero: los dos pueden atender a la misma hora.
              <div className="table-wrap">
                <table className="w-full min-w-[520px] border-separate border-spacing-1">
                  <thead>
                    <tr>
                      <th className="w-20 text-left text-[11px] uppercase tracking-wide text-muted">
                        Hora
                      </th>
                      {columns.map((person) => (
                        <th key={person.id} className="text-left">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-strong">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: person.color }}
                            />
                            <span className="truncate">{person.name}</span>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((slot) => (
                      <tr key={slot}>
                        <td className="align-middle text-xs font-bold text-strong">
                          {pretty12h(slot)}
                        </td>
                        {columns.map((person) => {
                          const appointment = busy.get(person.id + "|" + slot);
                          return (
                            <td key={person.id} className="align-top">
                              <div
                                className={
                                  "rounded-lg border px-2 py-1.5 " +
                                  (appointment
                                    ? "border-transparent"
                                    : "border-dashed border-line bg-surface")
                                }
                                style={
                                  appointment
                                    ? {
                                        backgroundColor: person.color + "1f",
                                        borderColor: person.color + "66",
                                      }
                                    : undefined
                                }
                              >
                                {appointment ? (
                                  <>
                                    <p className="truncate text-xs font-semibold text-strong">
                                      {appointment.clientName}
                                    </p>
                                    <p className="truncate text-[11px] text-muted">
                                      {appointment.serviceName}
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-[11px] text-subtle">Libre</p>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {slots.map((slot) => {
                  const person = columns[0];
                  const appointment =
                    busy.get((person?.id ?? "sin") + "|" + slot) ??
                    (person ? undefined : busy.get("sin|" + slot));
                  return (
                    <div
                      key={slot}
                      className={
                        "rounded-xl border px-3 py-2.5 text-left " +
                        (appointment
                          ? "border-brand-200 bg-brand-50"
                          : "border-dashed border-line bg-surface")
                      }
                    >
                      <p className="text-sm font-bold text-strong">{pretty12h(slot)}</p>
                      {appointment ? (
                        <>
                          <p className="truncate text-xs font-medium text-brand-700">
                            {appointment.clientName}
                          </p>
                          <p className="truncate text-[11px] text-muted">
                            {appointment.serviceName}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px] text-subtle">Libre</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card
            title="Detalle de los turnos"
            subtitle="Hora, cliente, quien atiende y cierre de venta"
          >
            {visible.length === 0 ? (
              <Empty
                title={
                  filterId
                    ? "Este barbero no tiene turnos este dia"
                    : "Nadie ha separado turno este dia"
                }
                hint="Comparte tu enlace de reservas por WhatsApp para que te separen el cupo."
              />
            ) : (
              <ul className="space-y-3">
                {visible.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-xl border-l-4 border-2 border-edge bg-surface p-3"
                    style={
                      a.staffId
                        ? { borderLeftColor: colorOf.get(a.staffId) ?? undefined }
                        : undefined
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-bold text-strong">
                          <Icon name="clock" className="h-4 w-4 text-brand-600" />
                          {pretty12h(a.startTime)} a {pretty12h(a.endTime)}
                        </p>
                        <p className="mt-1 text-sm text-body">{a.clientName}</p>
                        <p className="text-xs text-muted">
                          <Icon name="phone" className="mr-1 inline h-3 w-3" />
                          {a.clientPhone}
                        </p>
                        <p className="mt-1 text-sm text-brand-700">
                          {a.serviceName} - {money(a.price, user.currency)}
                        </p>
                        {a.notes && <p className="mt-1 text-xs italic text-muted">{a.notes}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={a.status} />
                        {a.staffName ? (
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-body">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: colorOf.get(a.staffId ?? "") ?? "#94a3b8" }}
                            />
                            Atiende {a.staffName}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-warn">Sin barbero</span>
                        )}
                        {a.sale && (
                          <span className="text-xs font-semibold text-good">
                            Cobrado {money(a.sale.total, user.currency)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                      {(() => {
                        const link = waLink(
                          toInternational(a.clientPhone, user.whatsappNumber),
                          confirmMessage({
                            businessName: user.businessName,
                            clientName: a.clientName,
                            prettyDay: prettyDay(a.day),
                            time: pretty12h(a.startTime),
                            serviceName: a.serviceName,
                            staffName: a.staffName,
                          })
                        );
                        if (!link) return null;
                        return (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-ghost btn-sm"
                            title="Escribirle al cliente por WhatsApp"
                          >
                            <Icon name="whatsapp" className="h-4 w-4" />
                            WhatsApp
                          </a>
                        );
                      })()}

                      {a.status === "PENDIENTE" && (
                        <form action={setAppointmentStatusAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="status" value="CONFIRMADO" />
                          <SubmitButton className="btn-ghost btn-sm" pendingText="...">
                            Confirmar
                          </SubmitButton>
                        </form>
                      )}

                      {varios && a.status !== "CANCELADO" && (
                        <details className="w-full sm:w-auto">
                          <summary className="btn-ghost btn-sm cursor-pointer list-none">
                            <Icon name="users" className="h-4 w-4" />
                            Pasar a otro barbero
                          </summary>
                          <form
                            action={setAppointmentStaffAction}
                            className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border-2 border-edge bg-panel p-3"
                          >
                            <input type="hidden" name="id" value={a.id} />
                            <label className="block">
                              <span className="label">Que lo atienda</span>
                              <select
                                className="input w-44"
                                name="staffId"
                                defaultValue={a.staffId ?? ""}
                              >
                                {team.map((person) => (
                                  <option key={person.id} value={person.id}>
                                    {person.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <SubmitButton className="btn-primary btn-sm" pendingText="Pasando...">
                              Pasar turno
                            </SubmitButton>
                          </form>
                        </details>
                      )}

                      {!a.sale && a.status !== "CANCELADO" && (
                        <details className="w-full sm:w-auto">
                          <summary className="btn-success btn-sm cursor-pointer list-none">
                            Cerrar venta
                          </summary>
                          <form
                            action={closeAppointmentSaleAction}
                            className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border-2 border-edge bg-panel p-3"
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
                          className="btn-ghost btn-sm text-bad"
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
          <ReminderList
            rows={recordatorios.map((r) => ({
              id: r.id,
              clientName: r.clientName,
              clientPhone: r.clientPhone,
              serviceName: r.serviceName,
              day: r.day,
              startTime: r.startTime,
              staffName: r.staff?.name ?? r.staffName,
              reminderSentAt: r.reminderSentAt,
            }))}
            businessName={user.businessName}
            address={user.address}
            ownerNumber={user.whatsappNumber}
            autoOn={user.whatsappProvider === "callmebot" || user.whatsappProvider === "meta"}
          />

          <Card title="Agregar turno a mano" subtitle="Para el cliente que llega sin reservar">
            <NewAppointmentForm
              day={day}
              slots={slots}
              services={services}
              team={team}
              defaultStaffId={filterId || me.id}
            />
          </Card>

          <Card title="Tu enlace de reservas">
            <p className="break-all rounded-xl border-2 border-edge bg-surface px-3 py-2.5 text-xs text-body">
              /reservar/{user.slug}
            </p>
            <p className="mt-2 text-xs text-muted">
              Mandalo por WhatsApp. El cliente elige el dia, la hora libre
              {varios ? ", el barbero" : ""} y el corte que quiere.
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
