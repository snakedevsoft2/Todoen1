"use client";

import { useActionState, useState } from "react";
import { closeCashAction } from "@/actions/cash";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { aCampo, money, parseMoney } from "@/lib/format";

export function CashCloseForm({
  day,
  cashSales,
  expenses,
  currency,
  defaultOpening,
  alreadyClosed,
}: {
  day: string;
  cashSales: number;
  expenses: number;
  currency: string;
  defaultOpening: number;
  alreadyClosed: boolean;
}) {
  const [state, formAction] = useActionState(closeCashAction, undefined);
  const [opening, setOpening] = useState(aCampo(defaultOpening, currency));
  const [counted, setCounted] = useState("");

  // Se leen con las mismas reglas con las que el servidor los va a guardar,
  // o el "esperado" de la pantalla no coincidiria con el de la caja cerrada.
  const openingNum = parseMoney(opening, currency);
  const countedNum = parseMoney(counted, currency);
  const expected = openingNum + cashSales - expenses;
  const diff = counted.trim() === "" ? 0 : countedNum - expected;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="day" value={day} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Base con la que abriste" hint="La plata que dejaste en el cajon al empezar.">
          <input
            className="input"
            name="openingAmount"
            inputMode="numeric"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
          />
        </Field>
        <Field label="Efectivo contado a mano" hint="Cuenta la plata fisica y escribela aqui.">
          <input
            className="input"
            name="countedCash"
            inputMode="numeric"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      <div className="rounded-xl border border-line bg-surface p-3 text-sm">
        <div className="flex justify-between py-1">
          <span className="text-muted">Base inicial</span>
          <span className="text-body">{money(openingNum, currency)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-muted">Ventas en efectivo</span>
          <span className="text-good">+{money(cashSales, currency)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-muted">Gastos del dia</span>
          <span className="text-bad">-{money(expenses, currency)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-line pt-2 font-semibold">
          <span className="text-body">Deberia haber en caja</span>
          <span className="text-strong">{money(expected, currency)}</span>
        </div>
        {counted.trim() !== "" && (
          <div className="mt-1 flex justify-between border-t border-line pt-2 font-semibold">
            <span className="text-body">Diferencia</span>
            <span className={diff === 0 ? "text-body" : diff > 0 ? "text-good" : "text-bad"}>
              {diff > 0 ? "+" : ""}
              {money(diff, currency)}
            </span>
          </div>
        )}
      </div>

      <Field label="Nota del cierre (opcional)">
        <input className="input" name="notes" placeholder="Ej: falto un billete de 10" />
      </Field>

      <SubmitButton className="btn-success w-full" pendingText="Cerrando caja...">
        {alreadyClosed ? "Actualizar el cierre" : "Cerrar la caja del dia"}
      </SubmitButton>
    </form>
  );
}
