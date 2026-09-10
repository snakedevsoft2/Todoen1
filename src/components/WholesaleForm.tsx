"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  deleteTierAction,
  saveTierAction,
  updateWholesaleAction,
} from "@/actions/wholesale";
import { money } from "@/lib/format";
import {
  MAX_PERCENT,
  MAX_TIERS,
  MIN_PERCENT,
  MIN_QTY,
  sortTiers,
  tierPrice,
  type Tier,
} from "@/lib/wholesale";
import { SubmitButton } from "./SubmitButton";
import { Alert, Empty, Field } from "./ui";
import { Icon } from "./Icon";

const WHOLESALE_TITLE = "Precios al por mayor";

/**
 * Editor de las promociones al por mayor.
 *
 * Son dos cosas en una: el texto del apartado, que se guarda de una, y las
 * escalas por cantidad, cada una con su propio formulario. Al lado de cada
 * escala mostramos a como quedaria una prenda real del catalogo: es la unica
 * forma de que el dueno vea que un 40% le come la utilidad antes de publicarlo.
 */
export function WholesaleForm({
  initial,
  tiers,
  currency,
  itemSingular,
  itemPlural,
  samplePrice,
}: {
  initial: {
    wholesaleOpen: boolean;
    wholesaleTitle: string | null;
    wholesaleNote: string | null;
  };
  tiers: Tier[];
  currency: string;
  itemSingular: string;
  itemPlural: string;
  /** Precio de una prenda real del catalogo, para el ejemplo. */
  samplePrice: number | null;
}) {
  const [state, formAction] = useActionState(updateWholesaleAction, undefined);
  const [open, setOpen] = useState(initial.wholesaleOpen);
  const [editando, setEditando] = useState<string | null>(null);

  const ordenadas = sortTiers(tiers);

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-4">
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

        <div className="space-y-2.5 rounded-xl border border-line bg-surface p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-strong">
            <input
              type="checkbox"
              name="wholesaleOpen"
              checked={open}
              onChange={(e) => setOpen(e.target.checked)}
              className="h-4 w-4 rounded border-line bg-panel accent-brand-600"
            />
            Mostrar el apartado de mayoristas en mi catalogo
          </label>
          <p className="text-xs text-subtle">
            Quien abra tu catalogo vera las escalas y, al armar su pedido, el descuento se le
            aplica solo apenas alcance la cantidad.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Titulo del apartado"
            hint={"Si lo dejas vacio ponemos: " + WHOLESALE_TITLE + "."}
          >
            <input
              className="input"
              name="wholesaleTitle"
              maxLength={60}
              defaultValue={initial.wholesaleTitle ?? ""}
              placeholder={WHOLESALE_TITLE}
            />
          </Field>
          <Field
            label="Condiciones del mayorista"
            hint="Pedido minimo, forma de pago, despachos a otras ciudades."
          >
            <input
              className="input"
              name="wholesaleNote"
              maxLength={300}
              defaultValue={initial.wholesaleNote ?? ""}
              placeholder="Ej: surtido libre de tallas y colores. Despachamos a todo el pais."
            />
          </Field>
        </div>

        <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
          <Icon name="check" className="h-4 w-4" />
          Guardar promociones
        </SubmitButton>
      </form>

      <div className="border-t border-line pt-4">
        <p className="font-display text-[15px] text-strong">Escalas por cantidad</p>
        <p className="mt-1 text-sm text-muted">
          Entre mas {itemPlural} lleve el pedido, mejor el precio. Se cuentan todas las unidades
          juntas, aunque sean tallas y colores distintos.
        </p>

        {ordenadas.length === 0 ? (
          <div className="mt-3">
            <Empty
              title="Todavia no tienes escalas"
              hint={"Empieza con una: desde 6 " + itemPlural + ", 10% menos."}
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {ordenadas.map((t) => (
              <li key={t.id} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-[15px] text-strong">
                      Desde {t.minQty} {itemPlural}
                      {t.label ? <span className="text-muted"> - {t.label}</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {t.percentOff}% de descuento
                      {samplePrice !== null && (
                        <>
                          {" - "}
                          {itemSingular} de {money(samplePrice, currency)} queda en{" "}
                          <strong className="text-brand-600">
                            {money(tierPrice(samplePrice, t.percentOff), currency)}
                          </strong>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditando(editando === t.id ? null : t.id)}
                      className="btn-ghost btn-sm"
                    >
                      <Icon name="sliders" className="h-4 w-4" />
                      {editando === t.id ? "Cerrar" : "Editar"}
                    </button>
                    <form action={deleteTierAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <SubmitButton
                        className="btn-ghost btn-sm text-bad"
                        pendingText="..."
                        confirm={"Borrar la escala desde " + t.minQty + " " + itemPlural + "?"}
                        ariaLabel="Borrar escala"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </SubmitButton>
                    </form>
                  </div>
                </div>

                {editando === t.id && (
                  <div className="mt-3 border-t border-line pt-3">
                    <TierForm
                      tier={t}
                      itemPlural={itemPlural}
                      submitLabel="Guardar cambios"
                      onDone={() => setEditando(null)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {ordenadas.length < MAX_TIERS ? (
          <div className="mt-4 rounded-xl border border-dashed border-line-strong p-3">
            <p className="mb-3 text-sm font-semibold text-strong">Agregar una escala</p>
            <TierForm itemPlural={itemPlural} submitLabel="Agregar escala" resetOnDone />
          </div>
        ) : (
          <p className="mt-4 text-xs text-subtle">
            Llegaste a las {MAX_TIERS} escalas. Borra una si quieres agregar otra.
          </p>
        )}
      </div>
    </div>
  );
}

/** El formulario de una escala. Sirve para crear y para editar. */
function TierForm({
  tier,
  submitLabel,
  itemPlural,
  onDone,
  resetOnDone,
}: {
  tier?: Tier;
  submitLabel: string;
  itemPlural: string;
  onDone?: () => void;
  /** Al crear dejamos el formulario limpio para meter la siguiente escala. */
  resetOnDone?: boolean;
}) {
  const [state, formAction] = useActionState(saveTierAction, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state?.ok) return;
    if (resetOnDone) ref.current?.reset();
    onDone?.();
  }, [state, onDone, resetOnDone]);

  return (
    <form ref={ref} action={formAction} className="space-y-3">
      {tier && <input type="hidden" name="id" value={tier.id} />}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={"Desde cuantas " + itemPlural}>
          <input
            className="input num"
            name="minQty"
            type="number"
            inputMode="numeric"
            min={MIN_QTY}
            required
            defaultValue={tier?.minQty ?? ""}
            placeholder="6"
          />
        </Field>
        <Field label="Descuento (%)">
          <input
            className="input num"
            name="percentOff"
            type="number"
            inputMode="numeric"
            min={MIN_PERCENT}
            max={MAX_PERCENT}
            required
            defaultValue={tier?.percentOff ?? ""}
            placeholder="10"
          />
        </Field>
        <Field label="Nombre (opcional)" hint="Ej: media docena, paca.">
          <input
            className="input"
            name="label"
            maxLength={40}
            defaultValue={tier?.label ?? ""}
            placeholder="Media docena"
          />
        </Field>
      </div>

      <SubmitButton className="btn-primary btn-sm" pendingText="Guardando...">
        <Icon name="plus" className="h-4 w-4" />
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
