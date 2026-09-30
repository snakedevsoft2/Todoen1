"use client";

import { useActionState, useState } from "react";
import { registrarSalidaAction } from "@/actions/parqueadero";
import { money } from "@/lib/format";
import type { Tarifa } from "@/lib/parqueadero-tarifa";
import { SubmitButton } from "../SubmitButton";
import { Alert, Field } from "../ui";
import { CobroEnVivo } from "./TiempoYCobro";

const METODOS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "OTRO", label: "Otro" },
];

/**
 * La salida del vehiculo: muestra lo que debe a esta hora, se elige como paga
 * y queda la venta. "Sale sin pagar" lo deja en pendientes por pagar con la
 * cuenta congelada.
 *
 * El valor lo pone la tarifa. Solo el dueño ve la casilla para cambiarlo.
 */
export function SalidaVehiculoForm({
  ticketId,
  enteredAt,
  tarifa,
  currency,
  /** Ya salio debiendo: el valor esta congelado y no hay opcion de volver a dejarlo pendiente. */
  debe,
  puedeCambiarValor,
  compacto = false,
}: {
  ticketId: string;
  enteredAt: string;
  tarifa: Tarifa;
  currency: string;
  debe: number | null;
  puedeCambiarValor: boolean;
  compacto?: boolean;
}) {
  const [state, action] = useActionState(registrarSalidaAction, undefined);
  const [metodo, setMetodo] = useState("EFECTIVO");
  const opciones = debe == null ? [...METODOS, { value: "PENDIENTE", label: "Sale sin pagar" }] : METODOS;

  if (state?.ok) return <Alert kind="ok">{state.ok}</Alert>;

  return (
    <form action={action} className="space-y-3" data-salida-parqueadero>
      <input type="hidden" name="ticketId" value={ticketId} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}

      <p className="text-sm text-muted">
        {debe == null ? "Debe a esta hora: " : "Quedó debiendo: "}
        <b className="text-lg text-strong">
          {debe == null ? <CobroEnVivo enteredAt={enteredAt} tarifa={tarifa} currency={currency} /> : money(debe, currency)}
        </b>
      </p>

      <div className={"grid gap-2 " + (compacto ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-3")}>
        {opciones.map((o) => (
          <label
            key={o.value}
            className={
              "cursor-pointer rounded-lg border px-2 py-2 text-center text-xs font-semibold transition " +
              (metodo === o.value
                ? o.value === "PENDIENTE"
                  ? "border-warn-line bg-warn-soft text-warn"
                  : "border-transparent bg-brand-600 text-on-brand"
                : "border-line bg-panel text-muted hover:bg-surface")
            }
          >
            <input
              type="radio"
              name="paymentMethod"
              value={o.value}
              checked={metodo === o.value}
              onChange={() => setMetodo(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>

      {puedeCambiarValor && (
        <Field label="Cobrar otro valor (opcional)" hint="Vacío: se cobra lo que dice la tarifa.">
          <input name="amount" inputMode="decimal" autoComplete="off" className="input" placeholder="Ej: descuento" />
        </Field>
      )}

      <SubmitButton
        className={(metodo === "PENDIENTE" ? "btn-ghost" : "btn-success") + " w-full"}
        pendingText="Guardando..."
        confirm={metodo === "PENDIENTE" ? "¿El vehículo sale sin pagar? Queda en pendientes por pagar." : undefined}
      >
        {metodo === "PENDIENTE" ? "Dar salida sin pagar" : debe == null ? "Cobrar y dar salida" : "Registrar pago"}
      </SubmitButton>
    </form>
  );
}
