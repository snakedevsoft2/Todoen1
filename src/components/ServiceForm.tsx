"use client";

import { useActionState } from "react";
import { saveServiceAction } from "@/actions/services";
import { SubmitButton } from "./SubmitButton";
import { PhotoField } from "./PhotoField";
import { aCampo, pasoMoneda } from "@/lib/format";
import { Alert, Field } from "./ui";

export type EditableService = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  durationMin: number;
  category: string;
  bookable: boolean;
  active: boolean;
  brand?: string | null;
  trackStock?: boolean;
  showcase?: boolean;
  supplierId?: string | null;
};

export function ServiceForm({
  service,
  categories,
  showDuration,
  submitLabel,
  /** Tienda de ropa: foto, marca, inventario por talla y catalogo publico. */
  clothing = false,
  photo,
  photoLabel = "Foto",
  suppliers = [],
  /** Moneda del negocio: decide si el precio admite centavos. */
  currency = "COP",
}: {
  currency?: string;
  service?: EditableService;
  categories: string[];
  showDuration: boolean;
  submitLabel: string;
  clothing?: boolean;
  photo?: string | null;
  /** Como se llama la foto en este negocio: del corte, del plato, de la prenda. */
  photoLabel?: string;
  /** A quien se le puede comprar esta prenda. Vacio si no hay proveedores. */
  suppliers?: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(saveServiceAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {service && <input type="hidden" name="id" value={service.id} />}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      {/* La foto es de todos: el corte, el plato y la prenda entran igual al
          portafolio publico. */}
      <PhotoField
        currentUrl={photo}
        label={photoLabel}
        hint="Se ve en tu portafolio publico y al vender."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <input
            className="input"
            name="name"
            required
            defaultValue={service?.name}
            placeholder="Ej: Corte degradado"
          />
        </Field>

        <Field label="Precio de venta">
          <input
            className="input"
            name="price"
            type="number"
            min={0}
            step={pasoMoneda(currency)}
            required
            defaultValue={aCampo(service?.price, currency)}
            placeholder="0"
          />
        </Field>

        <Field label="Costo (opcional)" hint="Lo que te cuesta a ti.">
          <input
            className="input"
            name="cost"
            type="number"
            min={0}
            step={pasoMoneda(currency)}
            defaultValue={aCampo(service?.cost, currency)}
            placeholder="0"
          />
        </Field>

        <Field label="Categoria">
          <input
            className="input"
            name="category"
            list="categorias"
            defaultValue={service?.category ?? "General"}
            placeholder="General"
          />
          <datalist id="categorias">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        {showDuration && (
          <Field label="Duracion en minutos" hint="Se usa para calcular el turno.">
            <input
              className="input"
              name="durationMin"
              type="number"
              min={5}
              step={5}
              defaultValue={service?.durationMin ?? 30}
            />
          </Field>
        )}

        {clothing && (
          <Field label="Marca (opcional)">
            <input
              className="input"
              name="brand"
              defaultValue={service?.brand ?? ""}
              placeholder="Ej: Levis"
            />
          </Field>
        )}

        {clothing && suppliers.length > 0 && (
          <Field label="A quien se la compras" hint="Se usa en el reporte de proveedores.">
            <select className="input" name="supplierId" defaultValue={service?.supplierId ?? ""}>
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Descripcion (opcional)" className="sm:col-span-2">
          <input
            className="input"
            name="description"
            defaultValue={service?.description ?? ""}
            placeholder={clothing ? "Ej: algodon, corte slim" : "Ej: incluye lavado"}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-4">
        {clothing && (
          <label className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              name="trackStock"
              defaultChecked={service ? service.trackStock !== false : true}
              className="h-4 w-4 rounded border-line bg-panel accent-brand-600"
            />
            Llevar inventario por talla
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            name="showcase"
            defaultChecked={service ? service.showcase !== false : true}
            className="h-4 w-4 rounded border-line bg-panel accent-brand-600"
          />
          Mostrar en mi portafolio
        </label>
        {showDuration && (
          <label className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              name="bookable"
              defaultChecked={service ? service.bookable : true}
              className="h-4 w-4 rounded border-line bg-panel accent-brand-600"
            />
            Se puede reservar en linea
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            name="active"
            defaultChecked={service ? service.active : true}
            className="h-4 w-4 rounded border-line bg-panel accent-brand-600"
          />
          Activo
        </label>
      </div>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
