"use client";

import { useActionState } from "react";
import { createAppointmentAction } from "@/actions/appointments";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";

export type ServiceOption = { id: string; name: string; price: number; durationMin: number };
export type StaffOption = { id: string; name: string; color: string };

export function NewAppointmentForm({
  day,
  slots,
  services,
  team,
  defaultStaffId,
}: {
  day: string;
  slots: string[];
  services: ServiceOption[];
  team: StaffOption[];
  /** Quien queda atendiendo por defecto: el filtro activo o quien esta usando la app. */
  defaultStaffId?: string;
}) {
  const [state, formAction] = useActionState(createAppointmentAction, undefined);
  const fallback = team.some((t) => t.id === defaultStaffId) ? defaultStaffId : team[0]?.id ?? "";

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
        {team.length > 1 && (
          <Field label="Quien atiende" className="sm:col-span-2">
            <select className="input" name="staffId" defaultValue={fallback}>
              {team.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {team.length === 1 && <input type="hidden" name="staffId" value={team[0].id} />}
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
