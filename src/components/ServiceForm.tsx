"use client";

import { useActionState } from "react";
import { saveServiceAction } from "@/actions/services";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";

export type EditableService = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  durationMin: number;
  category: string;
  bookable: boolean;
  active: boolean;
};

export function ServiceForm({
  service,
  categories,
  showDuration,
  submitLabel,
}: {
  service?: EditableService;
  categories: string[];
  showDuration: boolean;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(saveServiceAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {service && <input type="hidden" name="id" value={service.id} />}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <input
            className="input"
            name="name"
            required
            defaultValue={service?.name}
            placeholder="Ej: Corte degradado"
          />
        </Field>

        <Field label="Precio de venta">
          <input
            className="input"
            name="price"
            type="number"
            min={0}
            step={1}
            required
            defaultValue={service?.price ?? ""}
            placeholder="0"
          />
        </Field>

        <Field label="Costo (opcional)" hint="Lo que te cuesta a ti.">
          <input
            className="input"
            name="cost"
            type="number"
            min={0}
            step={1}
            defaultValue={service?.cost ?? ""}
            placeholder="0"
          />
        </Field>

        <Field label="Categoria">
          <input
            className="input"
            name="category"
            list="categorias"
            defaultValue={service?.category ?? "General"}
            placeholder="General"
          />
          <datalist id="categorias">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        {showDuration && (
          <Field label="Duracion en minutos" hint="Se usa para calcular el turno.">
            <input
              className="input"
              name="durationMin"
              type="number"
              min={5}
              step={5}
              defaultValue={service?.durationMin ?? 30}
            />
          </Field>
        )}

        <Field label="Descripcion (opcional)" className="sm:col-span-2">
          <input
            className="input"
            name="description"
            defaultValue={service?.description ?? ""}
            placeholder="Ej: incluye lavado"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-4">
        {showDuration && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              name="bookable"
              defaultChecked={service ? service.bookable : true}
              className="h-4 w-4 rounded border-line bg-ink accent-brand-500"
            />
            Se puede reservar en linea
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            name="active"
            defaultChecked={service ? service.active : true}
            className="h-4 w-4 rounded border-line bg-ink accent-brand-500"
          />
          Activo
        </label>
      </div>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
