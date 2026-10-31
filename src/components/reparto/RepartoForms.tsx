"use client";

import { useActionState } from "react";
import { abrirPlanillaAction, guardarClienteAction, guardarProductoAction, unirClientesAction } from "@/actions/reparto";
import { Alert, Field } from "../ui";
import { Icon } from "../Icon";
import { SubmitButton } from "../SubmitButton";

type Persona = { id: string; name: string };

/** Elegir vendedor y fecha: abre su planilla de ese dia, o la que ya tenia. */
export function AbrirPlanilla({ equipo, hoy }: { equipo: Persona[]; hoy: string }) {
  const [state, action] = useActionState(abrirPlanillaAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" data-abrir-planilla>
      {state?.error && <div className="sm:col-span-3"><Alert kind="error">{state.error}</Alert></div>}
      <Field label="Vendedor">
        <select className="input" name="staffId" required defaultValue="">
          <option value="" disabled>
            Escoge
          </option>
          {equipo.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Fecha">
        <input className="input" type="date" name="day" defaultValue={hoy} required />
      </Field>
      <SubmitButton className="btn-primary" pendingText="Abriendo...">
        <Icon name="plus" className="h-4 w-4" />
        Abrir planilla
      </SubmitButton>
    </form>
  );
}

export function ProductoForm({
  producto,
  inventario,
  hoy,
}: {
  producto?: { id: string; name: string; price: number; active: boolean; serviceId: string | null };
  inventario: Persona[];
  hoy: string;
}) {
  const [state, action] = useActionState(guardarProductoAction, undefined);
  return (
    <form action={action} className="space-y-2.5" data-form-producto>
      {producto && <input type="hidden" name="id" value={producto.id} />}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Nombre">
          <input className="input" name="name" required defaultValue={producto?.name} placeholder="Ej: PAPA GRANDE NAT" />
        </Field>
        <Field label="Precio">
          <input className="input" name="price" inputMode="decimal" required defaultValue={producto ? String(producto.price / 100) : ""} placeholder="0.80" />
        </Field>
        <Field label="El precio vale desde" hint="Las planillas de antes guardan su precio de ese día.">
          <input className="input" type="date" name="desde" defaultValue={hoy} />
        </Field>
        <Field label="Es el mismo de Inventario (opcional)">
          <select className="input" name="serviceId" defaultValue={producto?.serviceId ?? ""}>
            <option value="">Ninguno</option>
            {inventario.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-body">
        <input type="hidden" name="active" value="off" />
        <input type="checkbox" name="active" value="on" defaultChecked={producto?.active ?? true} />
        Sale en las planillas nuevas
      </label>
      <SubmitButton className="btn-primary btn-sm" pendingText="Guardando...">
        {producto ? "Guardar" : "Agregar producto"}
      </SubmitButton>
    </form>
  );
}

export function ClienteForm({
  cliente,
  equipo,
}: {
  cliente?: { id: string; name: string; staffId: string | null; notes: string | null };
  equipo: Persona[];
}) {
  const [state, action] = useActionState(guardarClienteAction, undefined);
  return (
    <form action={action} className="space-y-2.5" data-form-cliente>
      {cliente && <input type="hidden" name="id" value={cliente.id} />}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Nombre">
          <input className="input" name="name" required defaultValue={cliente?.name} />
        </Field>
        <Field label="Vendedor que lo visita">
          <select className="input" name="staffId" defaultValue={cliente?.staffId ?? ""}>
            <option value="">Ninguno</option>
            {equipo.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Nota (opcional)">
        <input className="input" name="notes" defaultValue={cliente?.notes ?? ""} />
      </Field>
      <SubmitButton className="btn-primary btn-sm" pendingText="Guardando...">
        {cliente ? "Guardar" : "Agregar cliente"}
      </SubmitButton>
    </form>
  );
}

/** Dos nombres que son el mismo cliente: los creditos y cobros del segundo pasan al primero. */
export function UnirClientes({ queda, sale }: { queda: Persona; sale: Persona }) {
  const [state, action] = useActionState(unirClientesAction, undefined);
  if (state?.ok) return <p className="text-xs text-good">{state.ok}</p>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-[13px]" data-unir-clientes>
      <input type="hidden" name="queda" value={queda.id} />
      <input type="hidden" name="sale" value={sale.id} />
      <span className="min-w-0 flex-1 text-body">
        <strong className="text-strong">{queda.name}</strong> ~ <strong className="text-strong">{sale.name}</strong>
      </span>
      {state?.error && <span className="text-xs text-bad">{state.error}</span>}
      <SubmitButton className="btn-ghost btn-sm" pendingText="..." confirm={"¿Juntar " + sale.name + " dentro de " + queda.name + "? Sus créditos y cobros pasan a " + queda.name + "."}>
        Son el mismo: juntar
      </SubmitButton>
    </form>
  );
}
