"use client";

import { useActionState, useState } from "react";
import { llegoAction, noLlegoAction, reprogramarCitaAction } from "@/actions/mis-citas";
import { pretty12h } from "@/lib/format";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

/**
 * Los botones de cada cita de la manicurista (MB Nails): Llegó, No llegó y
 * Cambiar hora. Nada de plata: la cobra la dueña. Que boton sale lo decide
 * queSePuedeMarcar (lib/novedades-cita.ts) y el servidor lo vuelve a revisar.
 */
export function AccionesCita({
  cita,
  puede,
  horas,
  hoy,
}: {
  cita: { id: string; clientName: string; day: string; startTime: string; status: string };
  puede: { llego: boolean; noLlego: boolean; cambiarHora: boolean };
  /** Las horas de la agenda ("09:00", "09:30"...). */
  horas: string[];
  hoy: string;
}) {
  const [cambiando, setCambiando] = useState(false);
  const [llego, marcarLlego] = useActionState(llegoAction, undefined);
  const [noLlego, marcarNoLlego] = useActionState(noLlegoAction, undefined);
  const botones = [puede.llego, puede.noLlego, puede.cambiarHora].filter(Boolean).length;
  const error = llego?.error ?? noLlego?.error;

  return (
    <div className="mt-3 space-y-2">
      {error && <Alert kind="error">{error}</Alert>}
      <div className={"grid gap-2 " + (botones >= 3 ? "grid-cols-3" : botones === 2 ? "grid-cols-2" : "grid-cols-1")}>
        {puede.llego && (
          <form action={marcarLlego} data-llego>
            <input type="hidden" name="id" value={cita.id} />
            <SubmitButton className="btn-success w-full justify-center px-2 py-3 text-sm" pendingText="…">
              <Icon name="check" className="h-4 w-4 shrink-0" />
              {cita.status === "NO_ASISTIO" ? "Sí llegó" : "Llegó"}
            </SubmitButton>
          </form>
        )}
        {puede.noLlego && (
          <form action={marcarNoLlego} data-no-llego>
            <input type="hidden" name="id" value={cita.id} />
            <SubmitButton
              className="btn-ghost w-full justify-center px-2 py-3 text-sm"
              pendingText="…"
              confirm={"¿Marcar que " + cita.clientName + " no llegó? Le avisamos a la dueña."}
            >
              <Icon name="x" className="h-4 w-4 shrink-0" />
              No llegó
            </SubmitButton>
          </form>
        )}
        {puede.cambiarHora && (
          <button
            type="button"
            onClick={() => setCambiando((v) => !v)}
            className={"btn-ghost w-full justify-center px-2 py-3 text-sm" + (cambiando ? " ring-2 ring-offset-1" : "")}
            aria-expanded={cambiando}
            data-boton-cambiar-hora
          >
            <Icon name="clock" className="h-4 w-4 shrink-0" />
            Cambiar hora
          </button>
        )}
      </div>

      {cambiando && <CambiarHora cita={cita} horas={horas} hoy={hoy} />}
    </div>
  );
}

function CambiarHora({
  cita,
  horas,
  hoy,
}: {
  cita: { id: string; day: string; startTime: string };
  horas: string[];
  hoy: string;
}) {
  const [state, formAction] = useActionState(reprogramarCitaAction, undefined);
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-line bg-panel p-3" data-cambiar-hora>
      <input type="hidden" name="id" value={cita.id} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nuevo día">
          <input className="input" type="date" name="day" min={hoy} defaultValue={cita.day < hoy ? hoy : cita.day} required />
        </Field>
        <Field label="Nueva hora">
          <select className="input" name="startTime" defaultValue={cita.startTime} required>
            {horas.map((h) => (
              <option key={h} value={h}>
                {pretty12h(h)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-xs text-muted">La dueña recibe el aviso con la hora de antes y la nueva.</p>
      <SubmitButton className="btn-primary w-full justify-center py-3 text-base" pendingText="Guardando…">
        Guardar nueva hora
      </SubmitButton>
    </form>
  );
}
