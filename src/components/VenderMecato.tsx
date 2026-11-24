"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { venderMecatoAction } from "@/actions/mis-citas";
import { money } from "@/lib/format";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

/**
 * El apartado Mecato de la manicurista (MB Nails): vende sin cita lo que este
 * en la lista, cada categoria por separado (Bebidas, Mecato, Uñas...). Solo
 * escoge que y cuantas: el precio no se cambia y el servidor lo vuelve a sacar
 * del catalogo.
 */

export type GrupoMecato = { categoria: string; productos: { id: string; name: string; price: number }[] };

export function VenderMecato({ grupos, currency }: { grupos: GrupoMecato[]; currency: string }) {
  const [state, formAction] = useActionState(venderMecatoAction, undefined);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [categoria, setCategoria] = useState(grupos[0]?.categoria ?? "");

  // Guardada la venta, el pedido queda en blanco para la siguiente.
  useEffect(() => {
    if (state?.ok) setCantidades({});
  }, [state]);

  const porId = useMemo(() => new Map(grupos.flatMap((g) => g.productos.map((p) => [p.id, p] as const))), [grupos]);
  const escogidos = Object.entries(cantidades).filter(([, n]) => n > 0);
  const total = escogidos.reduce((s, [id, n]) => s + (porId.get(id)?.price ?? 0) * n, 0);
  const cambiar = (id: string, delta: number) =>
    setCantidades((c) => ({ ...c, [id]: Math.max(0, Math.min(50, (c[id] ?? 0) + delta)) }));

  const grupo = grupos.find((g) => g.categoria === categoria) ?? grupos[0];
  const enCategoria = (cat: string) =>
    (grupos.find((g) => g.categoria === cat)?.productos ?? []).reduce((s, p) => s + (cantidades[p.id] ?? 0), 0);

  return (
    <div className="space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      {/* Una categoria a la vez: cada una por separado. */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Categorías">
        {grupos.map((g) => {
          const n = enCategoria(g.categoria);
          const activa = g.categoria === grupo?.categoria;
          return (
            <button
              key={g.categoria}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setCategoria(g.categoria)}
              className={
                "rounded-full border px-3.5 py-2 text-sm font-semibold transition " +
                (activa ? "border-brand-600 bg-brand-600 text-on-brand" : "border-line bg-surface text-body hover:bg-panel")
              }
              data-categoria={g.categoria}
            >
              {g.categoria}
              {n > 0 && <span className={"ml-1.5 rounded-full px-1.5 text-xs " + (activa ? "bg-white/25" : "bg-brand-50 text-brand-700")}>{n}</span>}
            </button>
          );
        })}
      </div>

      {grupo && (
        <section className="card-tight" data-grupo={grupo.categoria}>
          <h2 className="mb-2 text-base font-bold text-strong">{grupo.categoria}</h2>
          <ul className="divide-y divide-line">
            {grupo.productos.map((p) => {
              const n = cantidades[p.id] ?? 0;
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5" data-producto={p.name}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-strong">{p.name}</p>
                    <p className="text-xs text-muted">{money(p.price, currency)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {n > 0 && (
                      <>
                        <button type="button" className="btn-ghost h-10 w-10 justify-center p-0" onClick={() => cambiar(p.id, -1)} aria-label={"Quitar un " + p.name}>
                          −
                        </button>
                        <span className="w-6 text-center text-base font-bold tabular-nums text-strong" data-cantidad>
                          {n}
                        </span>
                      </>
                    )}
                    <button type="button" className="btn-primary h-10 w-10 justify-center p-0" onClick={() => cambiar(p.id, 1)} aria-label={"Agregar " + p.name} data-sumar>
                      <Icon name="plus" className="h-5 w-5 shrink-0" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <form action={formAction} className="card-tight space-y-3" data-cobrar-mecato>
        <input type="hidden" name="pedido" value={JSON.stringify(escogidos.map(([serviceId, qty]) => ({ serviceId, qty })))} />
        <h2 className="text-base font-bold text-strong">La venta</h2>
        {escogidos.length === 0 ? (
          <p className="text-sm text-muted">Toca + en lo que se lleva la clienta.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {escogidos.map(([id, n]) => {
              const p = porId.get(id);
              if (!p) return null;
              return (
                <li key={id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 text-body">
                    {n}x {p.name}
                  </span>
                  <span className="shrink-0 font-semibold text-strong">{money(p.price * n, currency)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-baseline justify-between border-t border-line pt-2">
          <span className="font-semibold text-strong">Total</span>
          <span className="text-lg font-bold text-strong" data-total-mecato>
            {money(total, currency)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Clienta (opcional)">
            <input className="input" name="clientName" maxLength={80} placeholder="Nombre" />
          </Field>
          <Field label="Cómo pagó">
            <select className="input" name="paymentMethod" defaultValue="EFECTIVO">
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="OTRO">Otro</option>
            </select>
          </Field>
        </div>
        <SubmitButton
          className="btn-success w-full justify-center py-3 text-base"
          pendingText="Guardando…"
          disabled={escogidos.length === 0}
          confirm={"¿Guardar la venta por " + money(total, currency) + "?"}
        >
          Guardar venta · {money(total, currency)}
        </SubmitButton>
      </form>
    </div>
  );
}
