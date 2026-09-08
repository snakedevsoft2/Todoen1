"use client";

import { useActionState } from "react";
import { createAppointmentAction } from "@/actions/appointments";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";

export type ServiceOption = { id: string; name: string; price: number; durationMin: number };

export function NewAppointmentForm({
  day,
  slots,
  services,
}: {
  day: string;
  slots: string[];
  services: ServiceOption[];
}) {
  const [state, formAction] = useActionState(createAppointmentAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cliente">
          <input className="input" name="clientName" required placeholder="Nombre del cliente" />
        </Field>
        <Field label="Telefono">
          <input className="input" name="clientPhone" inputMode="tel" placeholder="300 000 0000" />
        </Field>
        <Field label="Dia">
          <input className="input" type="date" name="day" defaultValue={day} required />
        </Field>
        <Field label="Hora">
          <select className="input" name="startTime" required defaultValue={slots[0] ?? ""}>
            {slots.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Servicio" className="sm:col-span-2">
          <select className="input" name="serviceId" defaultValue="">
            <option value="">Sin definir</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nota (opcional)" className="sm:col-span-2">
          <input className="input" name="notes" placeholder="Ej: viene con su hijo" />
        </Field>
      </div>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Agregando...">
        Agregar turno
      </SubmitButton>
    </form>
  );
}
