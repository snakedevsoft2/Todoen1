"use client";

import { useActionState } from "react";
import { editarCitaAction } from "@/actions/agenda-duena";
import { pretty12h } from "@/lib/format";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

/**
 * Editar una cita desde la Agenda de la dueña (MB Nails): clienta, servicio,
 * dia, hora y la manicurista que la atiende.
 */
export function EditarCita({
  cita,
  servicios,
  equipo,
  horas,
}: {
  cita: { id: string; clientName: string; clientPhone: string; serviceId: string | null; day: string; startTime: string; staffId: string | null; notes: string | null };
  servicios: { id: string; name: string }[];
  equipo: { id: string; name: string }[];
  horas: string[];
}) {
  const [state, formAction] = useActionState(editarCitaAction, undefined);
  return (
    <details className="w-full" data-editar-cita>
      <summary className="btn-ghost btn-sm cursor-pointer list-none">
        <Icon name="pencil" className="h-4 w-4" />
        Editar
      </summary>
      <form action={formAction} className="mt-2 space-y-3 rounded-xl border border-line bg-panel p-3">
        <input type="hidden" name="id" value={cita.id} />
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Clienta">
            <input className="input" name="clientName" required maxLength={80} defaultValue={cita.clientName} />
          </Field>
          <Field label="Celular">
            <input className="input" name="clientPhone" inputMode="tel" maxLength={40} defaultValue={cita.clientPhone === "-" ? "" : cita.clientPhone} />
          </Field>
          <Field label="Día">
            <input className="input" type="date" name="day" required defaultValue={cita.day} />
          </Field>
          <Field label="Hora">
            <select className="input" name="startTime" required defaultValue={cita.startTime}>
              {horas.map((h) => (
                <option key={h} value={h}>
                  {pretty12h(h)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="La atiende">
            <select className="input" name="staffId" required defaultValue={cita.staffId ?? ""}>
              <option value="" disabled>
                Escoge…
              </option>
              {equipo.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Servicio">
            <select className="input" name="serviceId" defaultValue={cita.serviceId ?? ""}>
              <option value="">El mismo</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nota" className="sm:col-span-2">
            <input className="input" name="notes" maxLength={300} defaultValue={cita.notes ?? ""} />
          </Field>
        </div>
        <SubmitButton className="btn-primary btn-sm" pendingText="Guardando…">
          Guardar cambios
        </SubmitButton>
      </form>
    </details>
  );
}
