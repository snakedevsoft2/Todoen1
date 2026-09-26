"use client";

import { useActionState } from "react";
import { addSaleItemAction } from "@/actions/sales";
import { pasoMoneda } from "@/lib/format";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";
import { useAccionSinSenal } from "@/components/SinSenal";

/**
 * Agregar un producto mas a una venta ya registrada, sin tener que anotar
 * otra venta aparte por lo que se le olvidó al cliente.
 */
export function AgregarItemVenta({ saleId, currency }: { saleId: string; currency: string }) {
  const [state, formAction] = useActionState(useAccionSinSenal("addSaleItemAction", addSaleItemAction), undefined);

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="id" value={saleId} />
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-brand-600">
          <Icon name="plus" className="h-3.5 w-3.5" />
          Agregar más a esta venta
        </summary>
        <div className="mt-2 space-y-2">
          {state?.error && <Alert kind="error">{state.error}</Alert>}
          {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Qué se agregó">
              <input className="input py-1.5 text-xs" name="name" required placeholder="Ej: Gaseosa" />
            </Field>
            <Field label="Cantidad">
              <input className="input py-1.5 text-xs" type="number" name="qty" min={1} step={1} defaultValue={1} />
            </Field>
            <Field label={"Precio (" + currency + ")"}>
              <input
                className="input py-1.5 text-xs"
                type="number"
                name="unitPrice"
                min={0}
                step={pasoMoneda(currency)}
                required
                placeholder="0"
              />
            </Field>
          </div>
          <SubmitButton className="btn-ghost btn-sm" pendingText="Agregando...">
            Agregar
          </SubmitButton>
        </div>
      </details>
    </form>
  );
}
