"use client";

import { useActionState, useState } from "react";
import { bookAppointmentAction } from "@/actions/appointments";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { money, pretty12h } from "@/lib/format";

export type BookableService = {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  description: string | null;
};

export function BookingForm({
  slug,
  day,
  slots,
  taken,
  services,
  currency,
  minTime,
  disabled,
  disabledReason,
}: {
  slug: string;
  day: string;
  slots: string[];
  taken: string[];
  services: BookableService[];
  currency: string;
  /** Si el dia elegido es hoy, la hora actual. Las horas anteriores se bloquean. */
  minTime?: string | null;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction] = useActionState(bookAppointmentAction, undefined);
  const [slot, setSlot] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const takenSet = new Set(taken);

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert kind="ok">
          Tu turno quedo separado. Codigo {state.ref}. Te esperamos puntual.
        </Alert>
        <button type="button" onClick={() => window.location.reload()} className="btn-ghost w-full">
          Separar otro turno
        </button>
      </div>
    );
  }

  if (disabled) {
    return <Alert kind="info">{disabledReason ?? "No hay horarios disponibles este dia."}</Alert>;
  }

  const isPast = (slot: string) => Boolean(minTime) && slot <= (minTime as string);
  const isBlocked = (slot: string) => takenSet.has(slot) || isPast(slot);
  const free = slots.filter((s) => !isBlocked(s));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="startTime" value={slot} />

      {state?.error && <Alert kind="error">{state.error}</Alert>}

      <div>
        <span className="label">Elige la hora ({free.length} libres)</span>
        {free.length === 0 ? (
          <Alert kind="info">Ya no quedan horas libres este dia. Prueba con otra fecha.</Alert>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => {
              const isTaken = isBlocked(s);
              const selected = slot === s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={isTaken}
                  onClick={() => setSlot(s)}
                  className={
                    "rounded-xl border px-2 py-2.5 text-xs font-semibold transition " +
                    (isTaken
                      ? "cursor-not-allowed border-line bg-ink/30 text-slate-600 line-through"
                      : selected
                        ? "border-brand-400 bg-brand-500 text-white"
                        : "border-line bg-ink/60 text-slate-200 hover:border-brand-400/60 hover:bg-white/5")
                  }
                >
                  {pretty12h(s)}
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
                "flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition " +
                (serviceId === s.id
                  ? "border-brand-400 bg-brand-500/15"
                  : "border-line bg-ink/60 hover:bg-white/5")
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
                <span className="block truncate text-sm font-semibold text-white">{s.name}</span>
                <span className="block text-[11px] text-slate-400">
                  {s.durationMin} min{s.description ? " - " + s.description : ""}
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold text-brand-300">
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
