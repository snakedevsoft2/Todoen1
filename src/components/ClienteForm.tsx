"use client";

import { useActionState, useEffect, useState } from "react";
import { guardarClienteAction, importarClientesAction } from "@/actions/crm";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

export type ClienteRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  address: string | null;
  notes: string | null;
};

/** Crear o editar la ficha. Al crear, lleva directo a la ficha nueva. */
export function ClienteForm({
  cliente,
  submitLabel,
  onDone,
}: {
  cliente?: ClienteRow;
  submitLabel: string;
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(guardarClienteAction, undefined);

  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-3">
      {cliente && <input type="hidden" name="id" value={cliente.id} />}
      {state?.error && <Alert kind="error">{state.error}</Alert>}

      <Field label="Nombre">
        <input
          className="input"
          name="name"
          required
          maxLength={200}
          defaultValue={cliente?.name}
          placeholder="Ej: Carolina Gómez"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Teléfono o WhatsApp">
          <input
            className="input"
            name="phone"
            type="tel"
            inputMode="tel"
            maxLength={40}
            defaultValue={cliente?.phone ?? ""}
            placeholder="300 000 0000"
          />
        </Field>
        <Field label="Correo (opcional)">
          <input
            className="input"
            name="email"
            type="email"
            maxLength={120}
            defaultValue={cliente?.email ?? ""}
            placeholder="nombre@correo.com"
          />
        </Field>
        <Field label="Cédula o NIT (opcional)">
          <input
            className="input"
            name="document"
            maxLength={40}
            defaultValue={cliente?.document ?? ""}
          />
        </Field>
        <Field label="Dirección (opcional)">
          <input
            className="input"
            name="address"
            maxLength={200}
            defaultValue={cliente?.address ?? ""}
          />
        </Field>
      </div>

      <Field label="Notas (opcional)" hint="Gustos, talla, cómo prefiere que le escriban.">
        <textarea
          className="input min-h-[80px]"
          name="notes"
          maxLength={2000}
          defaultValue={cliente?.notes ?? ""}
        />
      </Field>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

export function EditarCliente({ cliente }: { cliente: ClienteRow }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setAbierto(!abierto)}>
        {abierto ? "Cerrar" : "Editar datos"}
      </button>
      {abierto && (
        <div className="mt-3 rounded-xl border border-line bg-surface p-3">
          <ClienteForm cliente={cliente} submitLabel="Guardar cambios" onDone={() => setAbierto(false)} />
        </div>
      )}
    </div>
  );
}

/** Trae a la lista los clientes que ya estaban en turnos, cartera y reportes. */
export function ImportarClientes() {
  const [state, formAction] = useActionState(importarClientesAction, undefined);
  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
      <p className="text-sm text-body">
        Busca los nombres y teléfonos que ya están en turnos, ventas, cartera y reportes, y les crea su
        ficha. No duplica a nadie: puedes usarlo las veces que quieras.
      </p>
      <SubmitButton className="btn-ghost w-full" pendingText="Buscando...">
        <Icon name="download" className="h-4 w-4" />
        Traer mis clientes
      </SubmitButton>
    </form>
  );
}
