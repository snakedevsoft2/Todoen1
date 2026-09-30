"use client";

import { useActionState, useState } from "react";
import { ingresarVehiculoAction } from "@/actions/parqueadero";
import { money } from "@/lib/format";
import { SubmitButton } from "../SubmitButton";
import { Alert, Field } from "../ui";

export type TarifaOpcion = { id: string; name: string; pricePerHour: number; pricePerDay: number };

/**
 * Ingresar un vehiculo: la placa y el tipo, y listo. Telefono, correo y puesto
 * van plegados porque casi nunca se piden y no deben estorbar en la fila de
 * carros esperando.
 */
export function IngresoVehiculoForm({ tarifas, currency }: { tarifas: TarifaOpcion[]; currency: string }) {
  const [state, action] = useActionState(ingresarVehiculoAction, undefined);
  const [rateId, setRateId] = useState(tarifas[0]?.id ?? "");

  return (
    <form action={action} className="space-y-4" data-ingreso-parqueadero>
      {state?.error && <Alert kind="error">{state.error}</Alert>}

      <Field label="Placa">
        <input
          name="plate"
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={10}
          placeholder="ABC123"
          className="input text-center font-display text-2xl uppercase tracking-[0.2em]"
        />
      </Field>

      <div>
        <span className="label">Tipo de vehículo</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tarifas.map((t) => (
            <label
              key={t.id}
              className={
                "flex cursor-pointer flex-col items-center rounded-xl border px-2 py-3 text-center transition " +
                (rateId === t.id
                  ? "border-transparent bg-brand-600 text-on-brand shadow-soft"
                  : "border-line bg-panel hover:bg-surface")
              }
            >
              <input
                type="radio"
                name="rateId"
                value={t.id}
                checked={rateId === t.id}
                onChange={() => setRateId(t.id)}
                className="sr-only"
              />
              <span className="text-sm font-bold">{t.name}</span>
              <span className={"mt-0.5 text-[11px] " + (rateId === t.id ? "opacity-90" : "text-subtle")}>
                {t.pricePerHour > 0 ? money(t.pricePerHour, currency) + " / hora" : money(t.pricePerDay, currency) + " / día"}
              </span>
            </label>
          ))}
        </div>
      </div>

      <details className="rounded-xl border border-line bg-surface px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-muted">Datos del cliente (opcional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Teléfono" hint="Para mandarle el ticket por WhatsApp.">
            <input name="phone" type="tel" inputMode="tel" autoComplete="off" className="input" placeholder="300 123 4567" />
          </Field>
          <Field label="Correo">
            <input name="email" type="email" autoComplete="off" className="input" placeholder="cliente@correo.com" />
          </Field>
          <Field label="Puesto" hint="Dónde quedó adentro.">
            <input name="spot" autoComplete="off" maxLength={60} className="input" placeholder="Piso 2, puesto 14" />
          </Field>
        </div>
      </details>

      <SubmitButton className="btn-primary w-full" pendingText="Ingresando...">
        Ingresar y sacar ticket
      </SubmitButton>
    </form>
  );
}
