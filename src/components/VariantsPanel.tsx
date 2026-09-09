"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createVariantsBulkAction,
  deleteVariantAction,
  saveVariantAction,
  toggleVariantAction,
} from "@/actions/inventory";
import { COLOR_PRESETS, NUMERIC_SIZES, SIZE_PRESETS, variantLabel } from "@/lib/variants";
import { money } from "@/lib/format";
import { SubmitButton } from "./SubmitButton";
import { ScanButton } from "./ScanButton";
import { Alert, Badge, Field } from "./ui";
import { Icon } from "./Icon";

export type VariantRow = {
  id: string;
  size: string;
  color: string;
  sku: string | null;
  stock: number;
  minStock: number;
  price: number | null;
  cost: number;
  active: boolean;
};

/**
 * Las tallas de una prenda, dentro de la ficha del producto.
 *
 * Aqui se crean y se editan; el stock se mueve desde Inventario para que cada
 * cambio quede con su motivo en el historial.
 */
export function VariantsPanel({
  serviceId,
  variants,
  currency,
}: {
  serviceId: string;
  variants: VariantRow[];
  currency: string;
}) {
  const [tab, setTab] = useState<"lote" | "una">("lote");
  const total = variants.reduce((sum, v) => sum + Math.max(0, v.stock), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {variants.length === 0
            ? "Esta prenda todavia no tiene tallas."
            : variants.length + (variants.length === 1 ? " talla - " : " tallas - ") + total + " en stock"}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setTab("lote")}
            className={tab === "lote" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
          >
            Crear en lote
          </button>
          <button
            type="button"
            onClick={() => setTab("una")}
            className={tab === "una" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
          >
            Una sola
          </button>
        </div>
      </div>

      {variants.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border-2 border-edge bg-surface px-3">
          {variants.map((v) => (
            <VariantLine key={v.id} serviceId={serviceId} variant={v} currency={currency} />
          ))}
        </ul>
      )}

      {tab === "lote" ? (
        <BulkForm serviceId={serviceId} />
      ) : (
        <SingleForm serviceId={serviceId} />
      )}
    </div>
  );
}

function VariantLine({
  serviceId,
  variant,
  currency,
}: {
  serviceId: string;
  variant: VariantRow;
  currency: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-strong">
            {variantLabel(variant)}
            {variant.stock <= 0 && <Badge tone="red">Agotada</Badge>}
            {variant.stock > 0 && variant.stock <= variant.minStock && (
              <Badge tone="amber">Quedan pocas</Badge>
            )}
            {!variant.active && <Badge>Inactiva</Badge>}
          </p>
          <p className="text-[11px] text-subtle">
            {variant.stock} en stock - minimo {variant.minStock}
            {variant.price !== null ? " - precio " + money(variant.price, currency) : ""}
            {variant.sku ? " - cod " + variant.sku : ""}
          </p>
        </div>

        <div className="flex gap-1.5">
          <button type="button" onClick={() => setOpen(!open)} className="btn-ghost btn-sm">
            {open ? "Cerrar" : "Editar"}
          </button>
          <form action={toggleVariantAction}>
            <input type="hidden" name="id" value={variant.id} />
            <SubmitButton className="btn-ghost btn-sm" pendingText="...">
              {variant.active ? "Desactivar" : "Activar"}
            </SubmitButton>
          </form>
          <form action={deleteVariantAction}>
            <input type="hidden" name="id" value={variant.id} />
            <SubmitButton
              className="btn-ghost btn-sm px-2 text-bad"
              pendingText="..."
              ariaLabel="Borrar talla"
              confirm={
                "Borrar la talla " +
                variantLabel(variant) +
                (variant.stock > 0 ? ". Tiene " + variant.stock + " en stock." : "")
              }
            >
              <Icon name="trash" className="h-4 w-4" />
            </SubmitButton>
          </form>
        </div>
      </div>

      {open && (
        <div className="mt-2 rounded-xl border-2 border-edge bg-panel p-3">
          <SingleForm serviceId={serviceId} variant={variant} onDone={() => setOpen(false)} />
        </div>
      )}
    </li>
  );
}

function BulkForm({ serviceId }: { serviceId: string }) {
  const [state, formAction] = useActionState(createVariantsBulkAction, undefined);
  const [sizes, setSizes] = useState("S, M, L, XL");

  return (
    <form action={formAction} className="space-y-3 rounded-xl border-2 border-edge bg-panel p-3">
      <input type="hidden" name="serviceId" value={serviceId} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <Field label="Tallas" hint="Separadas por coma. Se crea una fila por talla y color.">
        <input
          className="input"
          name="sizes"
          value={sizes}
          onChange={(e) => setSizes(e.target.value)}
          placeholder="S, M, L, XL"
        />
      </Field>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => setSizes(SIZE_PRESETS.slice(0, 5).join(", "))}
        >
          Letras
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => setSizes(NUMERIC_SIZES.join(", "))}
        >
          Numeros
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setSizes("Unica")}>
          Talla unica
        </button>
      </div>

      <Field label="Colores (opcional)" hint="Dejalo vacio si la prenda viene en un solo color.">
        <input className="input" name="colors" placeholder="Negro, Blanco" list="colores-sugeridos" />
        <datalist id="colores-sugeridos">
          {COLOR_PRESETS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Stock por talla">
          <input className="input" type="number" name="stock" min={0} step={1} defaultValue={0} />
        </Field>
        <Field label="Costo unitario">
          <input className="input" type="number" name="cost" min={0} step={1} placeholder="0" />
        </Field>
        <Field label="Minimo" hint="Avisa cuando baje de aqui.">
          <input className="input" type="number" name="minStock" min={0} step={1} defaultValue={1} />
        </Field>
      </div>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Creando...">
        <Icon name="plus" className="h-4 w-4" />
        Crear tallas
      </SubmitButton>
    </form>
  );
}

function SingleForm({
  serviceId,
  variant,
  onDone,
}: {
  serviceId: string;
  variant?: VariantRow;
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(saveVariantAction, undefined);
  const [sku, setSku] = useState(variant?.sku ?? "");

  // Cuando guarda bien, cerramos la ficha de edicion.
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="serviceId" value={serviceId} />
      {variant && <input type="hidden" name="id" value={variant.id} />}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Talla">
          <input
            className="input"
            name="size"
            defaultValue={variant?.size ?? ""}
            placeholder="M"
            list="tallas-sugeridas"
          />
          <datalist id="tallas-sugeridas">
            {[...SIZE_PRESETS, ...NUMERIC_SIZES].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Color">
          <input
            className="input"
            name="color"
            defaultValue={variant?.color ?? ""}
            placeholder="Negro"
            list="colores-sugeridos-2"
          />
          <datalist id="colores-sugeridos-2">
            {COLOR_PRESETS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Codigo de barras (opcional)"
          hint="Escanea la etiqueta y despues la encuentras con el lector."
        >
          <div className="flex gap-2">
            <input
              className="input"
              name="sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="7701234567890"
            />
            <ScanButton
              onScan={setSku}
              label=""
              title="Escanear el codigo de la etiqueta"
              className="btn-ghost shrink-0 px-3"
            />
          </div>
        </Field>
        <Field label="Minimo" hint="Avisa cuando baje de aqui.">
          <input
            className="input"
            type="number"
            name="minStock"
            min={0}
            step={1}
            defaultValue={variant?.minStock ?? 1}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Costo unitario">
          <input
            className="input"
            type="number"
            name="cost"
            min={0}
            step={1}
            defaultValue={variant?.cost || ""}
            placeholder="0"
          />
        </Field>
        <Field label="Precio propio (opcional)" hint="Vacio: usa el precio de la prenda.">
          <input
            className="input"
            type="number"
            name="price"
            min={0}
            step={1}
            defaultValue={variant?.price ?? ""}
            placeholder="Igual al de la prenda"
          />
        </Field>
      </div>

      {!variant && (
        <Field label="Stock inicial" hint="Queda anotado como una entrada en el historial.">
          <input className="input" type="number" name="stock" min={0} step={1} defaultValue={0} />
        </Field>
      )}

      <SubmitButton className="btn-primary btn-sm" pendingText="Guardando...">
        {variant ? "Guardar talla" : "Agregar talla"}
      </SubmitButton>
    </form>
  );
}
