"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { stockMoveAction } from "@/actions/inventory";
import { SubmitButton } from "./SubmitButton";
import { ScanButton } from "./ScanButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

export type MovableVariant = {
  id: string;
  serviceName: string;
  label: string;
  stock: number;
  cost: number;
  /** Codigo de barras de la etiqueta, si se lo pusieron. */
  sku: string | null;
};

const TYPES = [
  {
    value: "ENTRADA",
    label: "Entrada",
    hint: "Llego mercancia nueva",
    icon: "arrowIn",
    tone: "text-good",
  },
  {
    value: "SALIDA",
    label: "Salida",
    hint: "Se daño, se regalo o se devolvio",
    icon: "arrowOut",
    tone: "text-bad",
  },
  {
    value: "AJUSTE",
    label: "Conteo",
    hint: "Contaste y no cuadraba",
    icon: "scale",
    tone: "text-warn",
  },
];

/**
 * Un solo formulario para las tres formas de mover el stock.
 *
 * En el conteo la persona escribe cuantas prendas conto de verdad, no la
 * diferencia: es como se hace un inventario fisico y evita restas mentales.
 */
export function StockMoveForm({
  variants,
  today,
  defaultVariantId,
}: {
  variants: MovableVariant[];
  today: string;
  defaultVariantId?: string;
}) {
  const [state, formAction] = useActionState(stockMoveAction, undefined);
  const [type, setType] = useState("ENTRADA");
  const [variantId, setVariantId] = useState(
    defaultVariantId && variants.some((v) => v.id === defaultVariantId)
      ? defaultVariantId
      : (variants[0]?.id ?? "")
  );

  const [scanAviso, setScanAviso] = useState("");

  const selected = useMemo(
    () => variants.find((v) => v.id === variantId),
    [variants, variantId]
  );

  const porCodigo = useCallback(
    (code: string) => {
      const encontrada = variants.find((v) => v.sku && v.sku.toUpperCase() === code);
      if (!encontrada) {
        setScanAviso(
          "Ninguna talla tiene el codigo " + code + ". Ponselo desde Productos, en la talla."
        );
        return;
      }
      setVariantId(encontrada.id);
      setScanAviso(encontrada.serviceName + " - " + encontrada.label + " lista para mover.");
    },
    [variants]
  );

  if (variants.length === 0) {
    return (
      <p className="text-sm text-muted">
        Primero crea una prenda con sus tallas en Productos, y aqui le cargas la mercancia.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => (
          <label
            key={t.value}
            className={
              "cursor-pointer rounded-xl border p-2.5 text-center transition " +
              (type === t.value
                ? "border-brand-500 bg-brand-50"
                : "border-line bg-surface hover:bg-surface")
            }
          >
            <input
              type="radio"
              name="type"
              value={t.value}
              checked={type === t.value}
              onChange={() => setType(t.value)}
              className="sr-only"
            />
            <Icon name={t.icon} className={"mx-auto h-5 w-5 " + t.tone} />
            <span className="mt-1 block text-xs font-semibold text-strong">{t.label}</span>
            <span className="mt-0.5 block text-[10px] leading-tight text-muted">{t.hint}</span>
          </label>
        ))}
      </div>

      <Field label="Prenda y talla">
        <div className="flex gap-2">
          <select
            className="input"
            name="variantId"
            value={variantId}
            onChange={(e) => {
              setVariantId(e.target.value);
              setScanAviso("");
            }}
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.serviceName} - {v.label} (hay {v.stock})
                {v.sku ? " - " + v.sku : ""}
              </option>
            ))}
          </select>
          <ScanButton
            onScan={porCodigo}
            label=""
            title="Escanear la etiqueta para elegir la talla"
            className="btn-ghost shrink-0 px-3"
          />
        </div>
      </Field>

      {scanAviso && <p className="-mt-1 text-xs text-muted">{scanAviso}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={type === "AJUSTE" ? "Cuantas contaste" : "Cantidad"}
          hint={
            type === "AJUSTE"
              ? "El sistema tiene " + (selected?.stock ?? 0) + "."
              : type === "ENTRADA"
                ? "Cuantas entran a la tienda."
                : "Cuantas salen del inventario."
          }
        >
          <input
            className="input"
            type="number"
            name="qty"
            min={type === "AJUSTE" ? 0 : 1}
            step={1}
            required
            defaultValue={type === "AJUSTE" ? (selected?.stock ?? 0) : 1}
            key={type + variantId}
          />
        </Field>

        {type === "ENTRADA" ? (
          <Field label="Costo por unidad" hint="Lo que te costo. Sirve para valorizar el inventario.">
            <input
              className="input"
              type="number"
              name="unitCost"
              min={0}
              step={1}
              defaultValue={selected?.cost || ""}
              placeholder="0"
              key={"cost-" + variantId}
            />
          </Field>
        ) : (
          <Field label="Dia del movimiento">
            <input className="input" type="date" name="day" defaultValue={today} />
          </Field>
        )}
      </div>

      {type === "ENTRADA" && (
        <Field label="Dia del movimiento">
          <input className="input" type="date" name="day" defaultValue={today} />
        </Field>
      )}

      <Field label="Motivo (opcional)">
        <input
          className="input"
          name="reason"
          placeholder={
            type === "ENTRADA"
              ? "Ej: pedido del proveedor"
              : type === "SALIDA"
                ? "Ej: prenda manchada"
                : "Ej: conteo del sabado"
          }
        />
      </Field>

      <SubmitButton className="btn-primary w-full" pendingText="Guardando...">
        <Icon name="check" className="h-4 w-4" />
        {type === "ENTRADA" ? "Registrar entrada" : type === "SALIDA" ? "Registrar salida" : "Guardar conteo"}
      </SubmitButton>
    </form>
  );
}
