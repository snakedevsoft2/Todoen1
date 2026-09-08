"use client";

import { useActionState } from "react";
import { createOrderAction } from "@/actions/orders";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";

export function NewOrderForm({ suggestion }: { suggestion: string }) {
  const [state, formAction] = useActionState(createOrderAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre de la cuenta">
          <input className="input" name="label" required defaultValue={suggestion} placeholder="Mesa 4" />
        </Field>
        <Field label="Nota (opcional)">
          <input className="input" name="notes" placeholder="Ej: para llevar" />
        </Field>
      </div>
      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Abriendo...">
        Abrir cuenta
      </SubmitButton>
    </form>
  );
}
