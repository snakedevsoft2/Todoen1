"use client";

import { useActionState } from "react";
import { addPaymentAction, createDebtAction, updateDueDayAction } from "@/actions/debts";
import { aCampo, money, pasoMoneda } from "@/lib/format";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

/** Anotar que alguien quedo debiendo. */
export function NewDebtForm({ today, currency }: { today: string; currency: string }) {
  const [state, formAction] = useActionState(createDebtAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Quien debe">
          <input className="input" name="clientName" required placeholder="Ej: Ana Torres" />
        </Field>
        <Field label="WhatsApp (opcional)" hint="Sin el no se le puede cobrar por chat.">
          <input className="input" name="clientPhone" inputMode="tel" placeholder="300 000 0000" />
        </Field>
      </div>

      <Field label="Por que debe">
        <input className="input" name="concept" required placeholder="Ej: 2 camisas y un jean" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={"Cuanto debe (" + currency + ")"}>
          <input
            className="input"
            type="number"
            name="amount"
            min={0}
            step={pasoMoneda(currency)}
            required
            placeholder="0"
          />
        </Field>
        <Field label="Desde cuando">
          <input className="input" type="date" name="day" defaultValue={today} />
        </Field>
        <Field label="Vence el" hint="Opcional.">
          <input className="input" type="date" name="dueDay" />
        </Field>
      </div>

      <Field label="Nota (opcional)">
        <input className="input" name="notes" placeholder="Ej: queda de pagar el viernes" />
      </Field>

      {/* Esta casilla decide si los abonos entran a la caja. Es la diferencia
          entre llevar bien las cuentas y contar la misma plata dos veces. */}
      <label className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3 text-sm text-body">
        <input
          type="checkbox"
          name="alreadyInvoiced"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line bg-panel accent-brand-600"
        />
        <span>
          <span className="font-bold text-strong">Esta venta ya la registre en Ventas</span>
          <span className="mt-0.5 block text-xs text-muted">
            Marcala solo si ya la anotaste. Asi los abonos no se suman otra vez a la caja. Si no la
            marcas, cada abono entra como venta del dia en que lo recibes.
          </span>
        </span>
      </label>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        <Icon name="plus" className="h-4 w-4" />
        Anotar la deuda
      </SubmitButton>
    </form>
  );
}

/** Registrar un abono sobre una deuda. */
export function PaymentForm({
  debtId,
  today,
  pendiente,
  currency,
  entraACaja,
}: {
  debtId: string;
  today: string;
  pendiente: number;
  currency: string;
  /** true si este abono se suma a la caja del dia. */
  entraACaja: boolean;
}) {
  const [state, formAction] = useActionState(addPaymentAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="debtId" value={debtId} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cuanto abono" hint={"Falta " + money(pendiente, currency) + "."}>
          <input
            className="input"
            type="number"
            name="amount"
            min={0}
            max={aCampo(pendiente, currency)}
            step={pasoMoneda(currency)}
            required
            defaultValue={aCampo(pendiente, currency)}
          />
        </Field>
        <Field label="Como pago">
          <select className="input" name="method" defaultValue="EFECTIVO">
            <option value="EFECTIVO">Efectivo</option>
            <option value="TARJETA">Tarjeta</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="OTRO">Otro</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Dia del abono">
          <input className="input" type="date" name="day" defaultValue={today} />
        </Field>
        <Field label="Nota (opcional)">
          <input className="input" name="notes" placeholder="Ej: abono parcial" />
        </Field>
      </div>

      <p className="text-xs text-subtle">
        {entraACaja
          ? "Este abono se suma a las ventas del dia, porque la venta no se habia registrado."
          : "Este abono no se suma a las ventas: esa venta ya se conto cuando la registraste."}
      </p>

      <SubmitButton className="btn-success w-full" pendingText="Guardando...">
        <Icon name="check" className="h-4 w-4" />
        Registrar abono
      </SubmitButton>
    </form>
  );
}

/** Cambiar el plazo cuando se acuerda uno nuevo. */
export function DueDayForm({ debtId, dueDay }: { debtId: string; dueDay: string | null }) {
  const [state, formAction] = useActionState(updateDueDayAction, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={debtId} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1">
          <span className="label">Proximo vencimiento</span>
          <input className="input" type="date" name="dueDay" defaultValue={dueDay ?? ""} />
        </label>
        <SubmitButton className="btn-ghost" pendingText="...">
          Guardar plazo
        </SubmitButton>
      </div>
    </form>
  );
}
