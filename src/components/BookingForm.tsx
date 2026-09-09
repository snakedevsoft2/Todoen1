"use client";

import { useActionState, useMemo, useState } from "react";
import { bookAppointmentAction } from "@/actions/appointments";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { money, pretty12h } from "@/lib/format";
import { initials } from "@/lib/staff";
import { Icon } from "./Icon";

export type BookableService = {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  description: string | null;
};

export type BookableStaff = { id: string; name: string; color: string };

/** Turno ya tomado: de que barbero y a que hora. */
export type TakenSlot = { staffId: string | null; startTime: string };

export function BookingForm({
  slug,
  day,
  slots,
  taken,
  team,
  services,
  currency,
  minTime,
  disabled,
  disabledReason,
}: {
  slug: string;
  day: string;
  slots: string[];
  taken: TakenSlot[];
  team: BookableStaff[];
  services: BookableService[];
  currency: string;
  /** Si el dia elegido es hoy, la hora actual. Las horas anteriores se bloquean. */
  minTime?: string | null;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction] = useActionState(bookAppointmentAction, undefined);
  const [slot, setSlot] = useState("");
  const [staffId, setStaffId] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");

  // Cada barbero tiene su propia agenda: dos pueden atender a la misma hora.
  const { busyByStaff, busyAll } = useMemo(() => {
    const byStaff = new Map<string, Set<string>>();
    const all = new Set<string>();
    for (const t of taken) {
      if (t.staffId) {
        const set = byStaff.get(t.staffId) ?? new Set<string>();
        set.add(t.startTime);
        byStaff.set(t.staffId, set);
      } else {
        all.add(t.startTime);
      }
    }
    return { busyByStaff: byStaff, busyAll: all };
  }, [taken]);

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert kind="ok">
          Tu turno quedo separado
          {state.staffName ? " con " + state.staffName : ""}. Codigo {state.ref}. Te esperamos
          puntual.
        </Alert>
        {state.waLink && (
          <>
            <a
              href={state.waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-success w-full"
            >
              <Icon name="whatsapp" className="h-5 w-5" />
              Avisar al negocio por WhatsApp
            </a>
            <p className="text-center text-xs text-subtle">
              Toca el boton y envia el mensaje para que te confirmen mas rapido.
            </p>
          </>
        )}
        <button type="button" onClick={() => window.location.reload()} className="btn-ghost w-full">
          Separar otro turno
        </button>
      </div>
    );
  }

  if (disabled) {
    return <Alert kind="info">{disabledReason ?? "No hay horarios disponibles este dia."}</Alert>;
  }

  const isPast = (s: string) => Boolean(minTime) && s <= (minTime as string);

  /** Con barbero elegido miramos su agenda; con "el que este libre", la de todos. */
  const isBlocked = (s: string) => {
    if (isPast(s)) return true;
    if (team.length === 0) return busyAll.has(s);
    if (staffId) return busyByStaff.get(staffId)?.has(s) ?? false;
    return team.every((person) => busyByStaff.get(person.id)?.has(s) ?? false);
  };

  const free = slots.filter((s) => !isBlocked(s));

  /** Cuantos barberos quedan libres a esa hora, para avisarlo en el boton. */
  const freeCountAt = (s: string) =>
    team.filter((person) => !(busyByStaff.get(person.id)?.has(s) ?? false)).length;

  function chooseStaff(id: string) {
    setStaffId(id);
    // Si la hora elegida ya no le sirve a ese barbero, se limpia.
    if (slot) {
      const blocked = id
        ? busyByStaff.get(id)?.has(slot) ?? false
        : team.every((person) => busyByStaff.get(person.id)?.has(slot) ?? false);
      if (blocked) setSlot("");
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="startTime" value={slot} />
      <input type="hidden" name="staffId" value={staffId} />

      {state?.error && <Alert kind="error">{state.error}</Alert>}

      {team.length > 1 && (
        <div>
          <span className="label">Con quien te quieres atender</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => chooseStaff("")}
              className={
                "rounded-xl border-2 px-3 py-2.5 text-left transition " +
                (staffId === ""
                  ? "border-edge bg-brand-600 text-on-brand shadow-block"
                  : "border-edge bg-panel hover:bg-surface")
              }
            >
              <span className="block text-sm font-bold">El que este libre</span>
              <span className="block text-[11px] opacity-75">Mas horarios disponibles</span>
            </button>
            {team.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => chooseStaff(person.id)}
                className={
                  "flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition " +
                  (staffId === person.id
                    ? "border-edge bg-brand-600 text-on-brand shadow-block"
                    : "border-edge bg-panel hover:bg-surface")
                }
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: person.color }}
                >
                  {initials(person.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{person.name}</span>
                  <span className="block text-[11px] opacity-75">
                    {slots.filter(
                      (s) => !isPast(s) && !(busyByStaff.get(person.id)?.has(s) ?? false)
                    ).length}{" "}
                    horas libres
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="label">Elige la hora ({free.length} libres)</span>
        {free.length === 0 ? (
          <Alert kind="info">
            {staffId
              ? "Ese barbero no tiene horas libres este dia. Prueba con otro barbero u otra fecha."
              : "Ya no quedan horas libres este dia. Prueba con otra fecha."}
          </Alert>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => {
              const isTaken = isBlocked(s);
              const selected = slot === s;
              const libres = freeCountAt(s);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={isTaken}
                  onClick={() => setSlot(s)}
                  className={
                    "rounded-lg border-2 px-2 py-2.5 text-xs font-bold transition " +
                    (isTaken
                      ? "cursor-not-allowed border-line bg-surface text-subtle line-through"
                      : selected
                        ? "border-edge bg-brand-600 text-on-brand shadow-[2px_2px_0_0_rgb(var(--edge))]"
                        : "border-edge bg-panel text-body hover:bg-surface")
                  }
                >
                  {pretty12h(s)}
                  {!isTaken && !staffId && team.length > 1 && (
                    <span
                      className={
                        "mt-0.5 block text-[10px] font-normal " +
                        (selected ? "text-on-brand" : "text-subtle")
                      }
                    >
                      {libres} libre{libres === 1 ? "" : "s"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <span className="label">Que te vas a hacer</span>
        <div className="space-y-2">
          {services.map((s) => (
            <label
              key={s.id}
              className={
                "flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 px-3 py-2.5 transition " +
                (serviceId === s.id
                  ? "border-edge bg-brand-600 text-on-brand shadow-block"
                  : "border-edge bg-panel hover:bg-surface")
              }
            >
              <span className="min-w-0">
                <input
                  type="radio"
                  name="serviceId"
                  value={s.id}
                  checked={serviceId === s.id}
                  onChange={() => setServiceId(s.id)}
                  className="sr-only"
                />
                <span className="block truncate text-sm font-bold">{s.name}</span>
                <span className="block text-[11px] opacity-75">
                  {s.durationMin} min{s.description ? " - " + s.description : ""}
                </span>
              </span>
              <span className={"shrink-0 font-display text-sm " + (serviceId === s.id ? "" : "text-brand-600")}>
                {money(s.price, currency)}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tu nombre">
          <input className="input" name="clientName" required placeholder="Nombre y apellido" />
        </Field>
        <Field label="Tu telefono">
          <input
            className="input"
            name="clientPhone"
            inputMode="tel"
            required
            placeholder="300 000 0000"
          />
        </Field>
      </div>

      <Field label="Nota para el barbero (opcional)">
        <input className="input" name="notes" placeholder="Ej: quiero degradado bajo" />
      </Field>

      {/* Lo decide el cliente: es su telefono. Va marcado porque es lo que
          casi todo el mundo quiere, pero se puede quitar. */}
      <label className="flex items-start gap-2.5 rounded-xl border-2 border-edge bg-surface p-3 text-sm text-body">
        <input
          type="checkbox"
          name="wantsReminder"
          defaultChecked
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line bg-panel accent-brand-600"
        />
        <span>
          <span className="font-bold text-strong">Recuerdenme mi turno por WhatsApp</span>
          <span className="mt-0.5 block text-xs text-muted">
            Te escribimos el dia antes al numero que dejaste.
          </span>
        </span>
      </label>

      <SubmitButton
        className="btn-primary w-full"
        pendingText="Separando tu turno..."
        disabled={!slot}
      >
        {slot ? "Separar turno a las " + pretty12h(slot) : "Elige una hora arriba"}
      </SubmitButton>
    </form>
  );
}
