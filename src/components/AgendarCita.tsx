"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import { agendarCitaAction } from "@/actions/mis-citas";
import { money, pretty12h } from "@/lib/format";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

/**
 * Agendar cita, en Citas de la manicurista (MB Nails): separa una cita para
 * ella misma. Las horas que ya tiene ocupadas salen bloqueadas; el servidor lo
 * vuelve a revisar antes de guardar.
 */

export type ServicioAgenda = { id: string; name: string; price: number; category: string };

export function AgendarCita({
  servicios,
  horas,
  hoy,
  ahora,
  ocupadas,
  diasQueSeAtiende,
  currency,
  alLado,
  inicial,
}: {
  servicios: ServicioAgenda[];
  /** Las horas de la agenda ("09:00", "09:30"...). */
  horas: string[];
  hoy: string;
  /** La hora de ahora en el negocio ("14:05"): hoy no se agenda hacia atras. */
  ahora: string;
  /** "YYYY-MM-DD HH:mm" de sus citas que no estan canceladas. */
  ocupadas: string[];
  /** 1 = lunes ... 7 = domingo. */
  diasQueSeAtiende: number[];
  currency: string;
  /** Lo que va al lado del boton, en la misma fila (el boton Vender). */
  alLado?: ReactNode;
  /** Desde Clientas: el formulario abre ya con la clienta escrita. */
  inicial?: { nombre: string; telefono: string } | null;
}) {
  const [state, formAction] = useActionState(agendarCitaAction, undefined);
  const [abierto, setAbierto] = useState(Boolean(inicial));
  const [dia, setDia] = useState(hoy);
  const [vuelta, setVuelta] = useState(0);

  // Guardada, el formulario queda limpio para la siguiente.
  useEffect(() => {
    if (state?.ok) setVuelta((v) => v + 1);
  }, [state]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, ServicioAgenda[]>();
    for (const s of servicios) m.set(s.category, [...(m.get(s.category) ?? []), s]);
    return [...m.entries()];
  }, [servicios]);

  const ocupado = new Set(ocupadas);
  const semana = (d: string) => {
    const n = new Date(d + "T12:00:00Z").getUTCDay();
    return n === 0 ? 7 : n;
  };
  const seAtiende = /^\d{4}-\d{2}-\d{2}$/.test(dia) && diasQueSeAtiende.includes(semana(dia));
  const libres = horas.filter((h) => !ocupado.has(dia + " " + h) && !(dia === hoy && h <= ahora));

  return (
    <div className="mb-5">
      <div className={alLado ? "grid grid-cols-2 gap-2" : ""}>
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          className="btn-primary w-full justify-center py-3 text-base"
          aria-expanded={abierto}
          data-boton-agendar
        >
          <Icon name="calendar" className="h-5 w-5 shrink-0" />
          Agendar cita
        </button>
        {alLado}
      </div>

      {state?.ok && !abierto && (
        <div className="mt-3">
          <Alert kind="ok">{state.ok}</Alert>
        </div>
      )}

      {abierto && (
        <form key={vuelta} action={formAction} className="card-tight mt-3 space-y-3" data-agendar-cita>
          {state?.error && <Alert kind="error">{state.error}</Alert>}
          {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Clienta">
              <input className="input" name="clientName" required maxLength={80} placeholder="Nombre" defaultValue={vuelta === 0 ? inicial?.nombre : undefined} />
            </Field>
            <Field label="Celular (opcional)" hint="Para escribirle por WhatsApp.">
              <input className="input" name="clientPhone" inputMode="tel" maxLength={40} placeholder="300 000 0000" defaultValue={vuelta === 0 ? inicial?.telefono : undefined} />
            </Field>
          </div>
          <Field label="Servicio">
            <select className="input" name="serviceId" required defaultValue="">
              <option value="" disabled>
                Escoge el servicio…
              </option>
              {porCategoria.map(([categoria, lista]) => (
                <optgroup key={categoria} label={categoria}>
                  {lista.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {money(s.price, currency)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Día">
              <input className="input" type="date" name="day" min={hoy} value={dia} onChange={(e) => setDia(e.target.value)} required />
            </Field>
            <Field label="Hora">
              <select className="input" name="startTime" required defaultValue="" key={dia} disabled={!seAtiende || libres.length === 0}>
                <option value="" disabled>
                  {!seAtiende ? "No se atiende" : libres.length === 0 ? "Sin horas libres" : "Escoge…"}
                </option>
                {libres.map((h) => (
                  <option key={h} value={h}>
                    {pretty12h(h)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Nota (opcional)">
            <input className="input" name="notes" maxLength={300} placeholder="Ej: quiere decorado con piedras" />
          </Field>
          <SubmitButton className="btn-success w-full justify-center py-3 text-base" pendingText="Agendando…" disabled={!seAtiende || libres.length === 0}>
            Guardar cita
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
