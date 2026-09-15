"use client";

import { useActionState } from "react";
import { pasoMoneda } from "@/lib/format";
import { createExpenseAction } from "@/actions/expenses";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { useAccionSinSenal } from "@/components/SinSenal";

const CATEGORIES = [
  "General",
  "Insumos",
  "Productos",
  "Arriendo",
  "Servicios",
  "Sueldos",
  "Domicilios",
  "Transporte",
  "Mantenimiento",
];

export function NewExpenseForm({ day, currency = "COP" }: { day: string; currency?: string }) {
  const [state, formAction] = useActionState(useAccionSinSenal("createExpenseAction", createExpenseAction), undefined);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <Field label="En que gastaste">
        <input className="input" name="description" required placeholder="Ej: gel y talco" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Valor">
          <input
            className="input"
            name="amount"
            type="number"
            min={0}
            step={pasoMoneda(currency)}
            required
            placeholder="0"
          />
        </Field>
        <Field label="Categoría">
          <select className="input" name="category" defaultValue="General">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Día">
          <input className="input" type="date" name="day" defaultValue={day} />
        </Field>
      </div>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        Anotar gasto
      </SubmitButton>
    </form>
  );
}
