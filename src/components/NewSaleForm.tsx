"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createSaleAction } from "@/actions/sales";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { money } from "@/lib/format";
import { Icon } from "./Icon";

type ServiceRow = { id: string; name: string; price: number; category: string };
type CartRow = { key: string; serviceId: string | null; name: string; unitPrice: number; qty: number };

export function NewSaleForm({
  services,
  currency,
  today,
  itemLabel,
}: {
  services: ServiceRow[];
  currency: string;
  today: string;
  itemLabel: string;
}) {
  const [state, formAction] = useActionState(createSaleAction, undefined);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [freeName, setFreeName] = useState("");
  const [freePrice, setFreePrice] = useState("");

  const total = useMemo(() => cart.reduce((s, r) => s + r.unitPrice * r.qty, 0), [cart]);

  // Al guardar bien la venta dejamos el carrito limpio para la siguiente.
  useEffect(() => {
    if (state?.ok) setCart([]);
  }, [state]);

  const grouped = useMemo(() => {
    return services.reduce<Record<string, ServiceRow[]>>((acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    }, {});
  }, [services]);

  function addService(service: ServiceRow) {
    setCart((prev) => {
      const found = prev.find((r) => r.serviceId === service.id);
      if (found) {
        return prev.map((r) => (r.key === found.key ? { ...r, qty: r.qty + 1 } : r));
      }
      return [
        ...prev,
        {
          key: service.id,
          serviceId: service.id,
          name: service.name,
          unitPrice: service.price,
          qty: 1,
        },
      ];
    });
  }

  function addFree() {
    const price = Math.round(Number(freePrice.replace(/[^\d]/g, "")) || 0);
    if (!freeName.trim() || price <= 0) return;
    setCart((prev) => [
      ...prev,
      {
        key: "free-" + Date.now(),
        serviceId: null,
        name: freeName.trim(),
        unitPrice: price,
        qty: 1,
      },
    ]);
    setFreeName("");
    setFreePrice("");
  }

  function bump(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((r) => (r.key === key ? { ...r, qty: r.qty + delta } : r))
        .filter((r) => r.qty > 0)
    );
  }

  function remove(key: string) {
    setCart((prev) => prev.filter((r) => r.key !== key));
  }

  const itemsJson = JSON.stringify(
    cart.map((r) => ({ serviceId: r.serviceId, name: r.name, unitPrice: r.unitPrice, qty: r.qty }))
  );

  return (
    <div className="space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      {services.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Toca para agregar {itemLabel}
          </p>
          {Object.entries(grouped).map(([category, list]) => (
            <div key={category}>
              <p className="mb-1.5 text-[11px] text-slate-500">{category}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {list.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addService(s)}
                    className="btn-ghost w-full flex-col items-start gap-0 px-3 py-2.5 text-left"
                  >
                    <span className="w-full truncate text-xs font-semibold text-white">{s.name}</span>
                    <span className="text-[11px] text-brand-300">{money(s.price, currency)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
        <input
          className="input"
          placeholder="Otro concepto"
          value={freeName}
          onChange={(e) => setFreeName(e.target.value)}
        />
        <input
          className="input"
          placeholder="Valor"
          inputMode="numeric"
          value={freePrice}
          onChange={(e) => setFreePrice(e.target.value)}
        />
        <button type="button" onClick={addFree} className="btn-ghost">
          <Icon name="plus" className="h-4 w-4" />
          Agregar
        </button>
      </div>

      <div className="rounded-xl border border-line bg-ink/50 p-3">
        {cart.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-500">
            Todavia no agregas nada a esta venta.
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {cart.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{r.name}</p>
                  <p className="text-xs text-slate-400">{money(r.unitPrice, currency)} c/u</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => bump(r.key, -1)} className="btn-ghost btn-sm px-2.5">
                    -
                  </button>
                  <span className="w-7 text-center text-sm font-bold">{r.qty}</span>
                  <button type="button" onClick={() => bump(r.key, 1)} className="btn-ghost btn-sm px-2.5">
                    +
                  </button>
                  <span className="w-24 text-right text-sm font-bold text-brand-300">
                    {money(r.unitPrice * r.qty, currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(r.key)}
                    className="btn-ghost btn-sm px-2 text-rose-300"
                    aria-label="Quitar"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm text-slate-400">Total de la venta</span>
          <span className="text-xl font-bold text-white">{money(total, currency)}</span>
        </div>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="itemsJson" value={itemsJson} />

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Dia de la venta">
            <input className="input" type="date" name="day" defaultValue={today} />
          </Field>
          <Field label="Metodo de pago">
            <select className="input" name="paymentMethod" defaultValue="EFECTIVO">
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="OTRO">Otro</option>
            </select>
          </Field>
          <Field label="Cliente (opcional)">
            <input className="input" name="clientName" placeholder="Mostrador" />
          </Field>
        </div>

        {cart.length === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="O registra solo el valor" hint="Util cuando no quieres detallar la venta.">
              <input className="input" name="manualTotal" type="number" min={0} step={1} placeholder="0" />
            </Field>
            <Field label="Concepto">
              <input className="input" name="concept" placeholder="Venta del mostrador" />
            </Field>
          </div>
        )}

        <Field label="Nota (opcional)">
          <input className="input" name="notes" placeholder="Ej: pago mitad efectivo" />
        </Field>

        <SubmitButton className="btn-success w-full" pendingText="Guardando venta...">
          <Icon name="check" className="h-4 w-4" />
          Guardar venta {cart.length > 0 ? "por " + money(total, currency) : ""}
        </SubmitButton>
      </form>
    </div>
  );
}
