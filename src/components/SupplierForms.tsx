"use client";

import { useActionState, useEffect, useState } from "react";
import {
  deleteSupplierAction,
  saveSupplierAction,
  toggleSupplierAction,
} from "@/actions/suppliers";
import { SubmitButton } from "./SubmitButton";
import { Alert, Badge, Field } from "./ui";
import { Icon } from "./Icon";

export type SupplierRow = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
};

export function SupplierForm({
  supplier,
  submitLabel,
  onDone,
}: {
  supplier?: SupplierRow;
  submitLabel: string;
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(saveSupplierAction, undefined);

  // Al guardar bien cerramos la ficha de edicion.
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-3">
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <Field label="Nombre del proveedor">
        <input
          className="input"
          name="name"
          required
          defaultValue={supplier?.name}
          placeholder="Ej: Textiles del Norte"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Con quien hablas (opcional)">
          <input
            className="input"
            name="contact"
            defaultValue={supplier?.contact ?? ""}
            placeholder="Ej: Marcela"
          />
        </Field>
        <Field label="Telefono (opcional)">
          <input
            className="input"
            name="phone"
            inputMode="tel"
            defaultValue={supplier?.phone ?? ""}
            placeholder="300 000 0000"
          />
        </Field>
      </div>

      <Field label="Nota (opcional)" hint="Ej: entrega los martes, pago a 30 dias.">
        <input
          className="input"
          name="notes"
          defaultValue={supplier?.notes ?? ""}
          placeholder="Lo que necesites recordar"
        />
      </Field>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

/** Una fila del listado, con sus cifras de compra y su ficha para editar. */
export function SupplierCard({
  supplier,
  stats,
}: {
  supplier: SupplierRow;
  stats: {
    comprado: string;
    unidades: number;
    ultima: string | null;
    prendas: string[];
  };
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <li className="rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-display text-[15px] text-strong">
            {supplier.name}
            {!supplier.active && <Badge tone="red">Inactivo</Badge>}
          </p>
          <p className="mt-1 text-xs text-muted">
            {supplier.contact ? supplier.contact : "Sin contacto"}
            {supplier.phone ? " - " + supplier.phone : ""}
          </p>
          {supplier.notes && (
            <p className="mt-0.5 text-xs italic text-subtle">{supplier.notes}</p>
          )}
        </div>

        <div className="text-right">
          <p className="font-display text-lg leading-none text-strong num">{stats.comprado}</p>
          <p className="mt-1 text-[11px] text-subtle">
            {stats.unidades} prendas
            {stats.ultima ? " - ultima " + stats.ultima : ""}
          </p>
        </div>
      </div>

      {stats.prendas.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {stats.prendas.map((prenda) => (
            <span
              key={prenda}
              className="rounded-md border border-line-strong bg-panel px-2 py-0.5 text-[11px] text-body"
            >
              {prenda}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setAbierto(!abierto)} className="btn-ghost btn-sm">
          {abierto ? "Cerrar" : "Editar"}
        </button>
        {supplier.phone && (
          <a
            href={"https://wa.me/" + supplier.phone.replace(/\D/g, "")}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost btn-sm"
          >
            <Icon name="whatsapp" className="h-4 w-4" />
            Pedir
          </a>
        )}
        <form action={toggleSupplierAction}>
          <input type="hidden" name="id" value={supplier.id} />
          <SubmitButton className="btn-ghost btn-sm" pendingText="...">
            {supplier.active ? "Desactivar" : "Activar"}
          </SubmitButton>
        </form>
        <form action={deleteSupplierAction}>
          <input type="hidden" name="id" value={supplier.id} />
          <SubmitButton
            className="btn-ghost btn-sm px-2 text-bad"
            pendingText="..."
            ariaLabel="Borrar proveedor"
            confirm={
              "Borrar a " + supplier.name + ". Las compras que ya le hiciste no se pierden."
            }
          >
            <Icon name="trash" className="h-4 w-4" />
          </SubmitButton>
        </form>
      </div>

      {abierto && (
        <div className="mt-3 rounded-xl border border-line bg-panel p-3">
          <SupplierForm
            supplier={supplier}
            submitLabel="Guardar cambios"
            onDone={() => setAbierto(false)}
          />
        </div>
      )}
    </li>
  );
}
