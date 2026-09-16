"use client";

import { useActionState } from "react";
import { configurarMesasAction } from "@/actions/mesas";
import { Alert } from "./ui";
import { SubmitButton } from "./SubmitButton";

/**
 * Cuántas mesas tiene el negocio. Al bajar el número no se borra ninguna: se
 * apagan las de número más alto (y sus cuentas de antes siguen en el
 * historial); al subirlo se crean las que falten, cada una con su propio QR.
 */
export function ConfigurarMesasForm({ total }: { total: number }) {
  const [state, formAction] = useActionState(configurarMesasAction, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2.5">
      <label className="block">
        <span className="label">¿Cuántas mesas tienes?</span>
        <input
          className="input w-28"
          type="number"
          name="cantidad"
          min={0}
          max={60}
          step={1}
          defaultValue={total}
          required
        />
      </label>
      <SubmitButton className="btn-primary btn-sm" pendingText="Guardando...">
        Guardar
      </SubmitButton>
      {state?.error && (
        <div className="w-full">
          <Alert kind="error">{state.error}</Alert>
        </div>
      )}
      {state?.ok && (
        <div className="w-full">
          <Alert kind="ok">{state.ok}</Alert>
        </div>
      )}
    </form>
  );
}
