"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  borrarSeguimientoAction,
  completarSeguimientoAction,
  crearSeguimientoAction,
} from "@/actions/crm";
import { addDays } from "@/lib/dates";
import { pretty12h, shortDay } from "@/lib/format";
import type { EstadoSeguimiento } from "@/lib/crm";
import { SubmitButton } from "./SubmitButton";
import { Alert, Badge, Field } from "./ui";
import { Icon } from "./Icon";

type Opcion = { id: string; name: string };

/**
 * Agendar algo que hay que hacer con un cliente.
 *
 * Los atajos de fecha van primero porque casi siempre es "mañana" o "la otra
 * semana", y abrir un calendario para eso es un paso de mas.
 */
export function SeguimientoForm({
  hoy,
  yoId,
  personas,
  clientes,
  customerId,
  dealId,
}: {
  hoy: string;
  yoId: string;
  personas: Opcion[];
  /** Si no viene customerId, se ofrece elegir el cliente (opcional). */
  clientes?: Opcion[];
  customerId?: string;
  dealId?: string;
}) {
  const [state, formAction] = useActionState(crearSeguimientoAction, undefined);
  const [dia, setDia] = useState(addDays(hoy, 1));
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      setDia(addDays(hoy, 1));
    }
  }, [state, hoy]);

  const atajos = [
    { label: "Hoy", day: hoy },
    { label: "Mañana", day: addDays(hoy, 1) },
    { label: "En 3 días", day: addDays(hoy, 3) },
    { label: "En una semana", day: addDays(hoy, 7) },
  ];

  return (
    <form ref={form} action={formAction} className="space-y-3">
      {customerId && <input type="hidden" name="customerId" value={customerId} />}
      {dealId && <input type="hidden" name="dealId" value={dealId} />}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <Field label="Qué hay que hacer">
        <input
          className="input"
          name="title"
          required
          maxLength={200}
          placeholder="Ej: Llamar para confirmar el pedido"
        />
      </Field>

      {!customerId && clientes && (
        <Field label="Cliente (opcional)">
          <select className="input" name="customerId" defaultValue="">
            <option value="">Sin cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div>
        <span className="label">Cuándo</span>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {atajos.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => setDia(a.day)}
              className={
                "rounded-full border px-3 py-1 text-[13px] font-semibold transition-all duration-150 active:scale-95 " +
                (dia === a.day
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-line-strong bg-panel text-body hover:border-brand-400")
              }
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            className="input"
            type="date"
            name="dueDay"
            required
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            aria-label="Día"
          />
          <input className="input" type="time" name="dueTime" aria-label="Hora (opcional)" />
        </div>
      </div>

      {personas.length > 1 && (
        <Field label="A quién le toca">
          <select className="input" name="staffId" defaultValue={yoId}>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === yoId ? p.name + " (yo)" : p.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Agendando...">
        <Icon name="plus" className="h-4 w-4" />
        Agendar seguimiento
      </SubmitButton>
    </form>
  );
}

export type SeguimientoRow = {
  id: string;
  title: string;
  dueDay: string;
  dueTime: string | null;
  hecho: boolean;
  estado: EstadoSeguimiento;
  customerId: string | null;
  customerName: string | null;
  staffName: string | null;
  whatsapp: string | null;
  puedeBorrar: boolean;
};

const ESTADO: Record<EstadoSeguimiento, { label: string; tone: "red" | "amber" | "slate" | "green" }> = {
  atrasado: { label: "Atrasado", tone: "red" },
  hoy: { label: "Hoy", tone: "amber" },
  proximo: { label: "Próximo", tone: "slate" },
  hecho: { label: "Hecho", tone: "green" },
};

/** Un seguimiento con su circulo para marcarlo hecho, como una lista de tareas. */
export function SeguimientoFila({ s, conCliente = true }: { s: SeguimientoRow; conCliente?: boolean }) {
  return (
    <li className="flex items-start gap-3 border-b border-line py-3 last:border-0">
      <form action={completarSeguimientoAction} className="pt-0.5">
        <input type="hidden" name="id" value={s.id} />
        <SubmitButton
          className={
            "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-200 active:scale-90 " +
            (s.hecho ? "border-good bg-good text-white" : "border-line-strong hover:border-brand-500")
          }
          pendingText="·"
          ariaLabel={s.hecho ? "Marcar como pendiente" : "Marcar como hecho"}
        >
          {s.hecho ? <Icon name="check" className="h-3.5 w-3.5" /> : <span />}
        </SubmitButton>
      </form>

      <div className="min-w-0 flex-1">
        <p
          className={
            "text-sm font-semibold [overflow-wrap:anywhere] " +
            (s.hecho ? "text-subtle line-through" : "text-strong")
          }
        >
          {s.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          {!s.hecho && <Badge tone={ESTADO[s.estado].tone}>{ESTADO[s.estado].label}</Badge>}
          <span>
            {shortDay(s.dueDay)}
            {s.dueTime ? " · " + pretty12h(s.dueTime) : ""}
          </span>
          {conCliente && s.customerId && s.customerName && (
            <>
              <span aria-hidden>·</span>
              <Link href={"/panel/clientes/" + s.customerId} className="font-semibold text-body hover:underline">
                {s.customerName}
              </Link>
            </>
          )}
          {s.staffName && (
            <>
              <span aria-hidden>·</span>
              <span>{s.staffName}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {s.whatsapp && !s.hecho && (
          <a
            href={s.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost btn-sm px-2 text-good"
            aria-label={"Escribirle a " + (s.customerName ?? "el cliente") + " por WhatsApp"}
          >
            <Icon name="whatsapp" className="h-4 w-4" />
          </a>
        )}
        {s.puedeBorrar && (
          <form action={borrarSeguimientoAction}>
            <input type="hidden" name="id" value={s.id} />
            <SubmitButton
              className="btn-ghost btn-sm px-2 text-subtle hover:text-bad"
              pendingText="..."
              ariaLabel="Borrar seguimiento"
              confirm="¿Borrar este seguimiento?"
            >
              <Icon name="trash" className="h-4 w-4" />
            </SubmitButton>
          </form>
        )}
      </div>
    </li>
  );
}
