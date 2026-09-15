"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { guardarOportunidadAction } from "@/actions/crm";
import { ETAPAS, type Etapa } from "@/lib/crm";
import { aCampo, pasoMoneda } from "@/lib/format";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { useAccionSinSenal } from "@/components/SinSenal";

type Opcion = { id: string; name: string };

export type OportunidadRow = {
  id: string;
  title: string;
  value: number;
  stage: Etapa;
  staffId: string | null;
  expectedDay: string | null;
  lostReason: string | null;
};

export function OportunidadForm({
  currency,
  yoId,
  personas,
  clientes,
  customerId,
  deal,
  submitLabel,
  onDone,
}: {
  currency: string;
  yoId: string;
  personas: Opcion[];
  clientes?: Opcion[];
  customerId?: string;
  deal?: OportunidadRow;
  submitLabel: string;
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(useAccionSinSenal("guardarOportunidadAction", guardarOportunidadAction), undefined);
  const [stage, setStage] = useState<Etapa>(deal?.stage ?? "NUEVO");
  const form = useRef<HTMLFormElement>(null);
  const editando = Boolean(deal);

  useEffect(() => {
    if (!state?.ok) return;
    onDone?.();
    // La nueva queda en blanco para poder anotar otra seguida.
    if (!editando) {
      form.current?.reset();
      setStage("NUEVO");
    }
  }, [state, onDone, editando]);

  return (
    <form ref={form} action={formAction} className="space-y-3">
      {deal && <input type="hidden" name="id" value={deal.id} />}
      {!deal && customerId && <input type="hidden" name="customerId" value={customerId} />}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && !onDone && <Alert kind="ok">{state.ok}</Alert>}

      {!deal && !customerId && clientes && (
        <Field label="Cliente">
          <select className="input" name="customerId" required defaultValue="">
            <option value="" disabled>
              Elige el cliente
            </option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Qué le quieres vender">
        <input
          className="input"
          name="title"
          required
          maxLength={200}
          defaultValue={deal?.title}
          placeholder="Ej: Uniformes para 20 empleados"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cuánto vale">
          <input
            className="input num"
            name="value"
            type="number"
            min="0"
            step={pasoMoneda(currency)}
            inputMode="decimal"
            defaultValue={deal ? aCampo(deal.value, currency) : ""}
            placeholder="0"
          />
        </Field>
        <Field label="En qué va">
          <select
            className="input"
            name="stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as Etapa)}
          >
            {ETAPAS.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cierre esperado (opcional)">
          <input className="input" name="expectedDay" type="date" defaultValue={deal?.expectedDay ?? ""} />
        </Field>
        {personas.length > 1 && (
          <Field label="Quién la lleva">
            <select className="input" name="staffId" defaultValue={deal?.staffId ?? yoId}>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === yoId ? p.name + " (yo)" : p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {stage === "PERDIDO" && (
        <Field label="Por qué se perdió (opcional)" hint="Sirve para ver qué se repite.">
          <input
            className="input"
            name="lostReason"
            maxLength={200}
            defaultValue={deal?.lostReason ?? ""}
            placeholder="Ej: le pareció caro, compró en otro lado"
          />
        </Field>
      )}

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

export function EditarOportunidad(props: {
  currency: string;
  yoId: string;
  personas: Opcion[];
  deal: OportunidadRow;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setAbierto(!abierto)}>
        {abierto ? "Cerrar" : "Editar"}
      </button>
      {abierto && (
        <div className="mt-3 w-full rounded-xl border border-line bg-panel p-3">
          <OportunidadForm {...props} submitLabel="Guardar cambios" onDone={() => setAbierto(false)} />
        </div>
      )}
    </>
  );
}
