"use client";

import { useActionState } from "react";
import { guardarTarifaAction } from "@/actions/parqueadero";
import { aCampo } from "@/lib/format";
import { FRACCIONES } from "@/lib/parqueadero-tarifa";
import { SubmitButton } from "../SubmitButton";
import { Alert, Field } from "../ui";

export type TarifaEditable = {
  id: string;
  name: string;
  pricePerHour: number;
  fractionMinutes: number;
  graceMinutes: number;
  pricePerDay: number;
};

/** Crear o cambiar una tarifa. Sin `tarifa` es una nueva. */
export function TarifaForm({ tarifa, currency }: { tarifa?: TarifaEditable; currency: string }) {
  const [state, action] = useActionState(guardarTarifaAction, undefined);

  return (
    <form action={action} className="space-y-3" data-tarifa-form>
      {tarifa && <input type="hidden" name="id" value={tarifa.id} />}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo de vehículo">
          <input name="name" required maxLength={40} defaultValue={tarifa?.name} placeholder="Moto, Carro, Camioneta..." className="input" />
        </Field>
        <Field label="Precio por hora" hint="0 si solo cobras por día.">
          <input name="pricePerHour" inputMode="decimal" defaultValue={aCampo(tarifa?.pricePerHour ?? null, currency)} placeholder="3000" className="input" />
        </Field>
        <Field label="Cómo se cobra el tiempo">
          <select name="fractionMinutes" defaultValue={String(tarifa?.fractionMinutes ?? 60)} className="input">
            {FRACCIONES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Precio del día" hint="Lo máximo por 24 horas. 0 = sin tope.">
          <input name="pricePerDay" inputMode="decimal" defaultValue={aCampo(tarifa?.pricePerDay ?? null, currency)} placeholder="20000" className="input" />
        </Field>
        <Field label="Minutos gratis" hint="Si sale antes de esto, no paga.">
          <input name="graceMinutes" type="number" min={0} max={240} defaultValue={tarifa?.graceMinutes ?? 0} className="input" />
        </Field>
      </div>

      <SubmitButton className="btn-primary btn-sm" pendingText="Guardando...">
        {tarifa ? "Guardar cambios" : "Agregar tarifa"}
      </SubmitButton>
    </form>
  );
}
