"use client";

import { useActionState, useState } from "react";
import { eliminarCuentaAction } from "@/actions/admin";

const normalizar = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Eliminar la cuenta para siempre.
 *
 * Pide mas que suspender a proposito: muestra lo que se va a perder, hay que
 * escribir el nombre del negocio y marcar que se entiende que no se recupera.
 * El servidor vuelve a revisar el nombre: el boton apagado no es la proteccion.
 */
export function EliminarCuentaForm({
  userId,
  businessName,
  resumen,
}: {
  userId: string;
  businessName: string;
  /** Lo que tiene registrado, solo lo que no esta en cero. */
  resumen: { label: string; n: number }[];
}) {
  const [state, formAction, pending] = useActionState(eliminarCuentaAction, undefined);
  const [confirmacion, setConfirmacion] = useState("");
  const [entiendo, setEntiendo] = useState(false);

  const coincide = normalizar(confirmacion) !== "" && normalizar(confirmacion) === normalizar(businessName);

  return (
    <form action={formAction} className="space-y-3" data-eliminar-cuenta>
      <input type="hidden" name="userId" value={userId} />

      {state?.error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-xs text-rose-300">{state.error}</p>}

      <p className="text-[12px] leading-snug text-slate-400">
        Se borra para siempre la cuenta, su equipo y todo lo que registró. <strong className="text-rose-300">No se puede
        deshacer.</strong> Si solo quieres que no entre, suspéndela.
      </p>

      {resumen.length > 0 ? (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-rose-900/60 bg-rose-500/5 px-3 py-2 text-[12px] text-slate-300">
          {resumen.map((m) => (
            <li key={m.label}>
              <strong className="text-slate-100">{m.n}</strong> {m.label.toLowerCase()}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-slate-500">No tiene nada registrado.</p>
      )}

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
          Escribe <span className="text-slate-300">{businessName}</span> para confirmar
        </span>
        <input
          name="confirmacion"
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          autoComplete="off"
          className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-slate-600 focus:outline-none"
        />
      </label>

      <label className="flex items-start gap-2 text-[12px] text-slate-300">
        <input type="checkbox" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} className="mt-0.5" />
        Entiendo que la cuenta y sus datos no se pueden recuperar
      </label>

      <button
        type="submit"
        disabled={!coincide || !entiendo || pending}
        className="w-full rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
      >
        {pending ? "Eliminando..." : "Eliminar para siempre"}
      </button>
    </form>
  );
}
