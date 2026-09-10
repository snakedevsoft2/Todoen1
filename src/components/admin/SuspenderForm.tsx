"use client";

import { useActionState, useState } from "react";
import { suspendAccountAction } from "@/actions/admin";

/**
 * Suspender pide dos cosas a proposito: el motivo y escribir el nombre del
 * negocio. Es la accion que le tumba el trabajo a alguien, y no deberia
 * poderse hacer de un solo clic distraido.
 *
 * El motivo no lo ve el cliente: es para acordarse en tres meses de por que.
 */
export function SuspenderForm({
  userId,
  businessName,
}: {
  userId: string;
  businessName: string;
}) {
  const [state, formAction, pending] = useActionState(suspendAccountAction, undefined);
  const [confirmacion, setConfirmacion] = useState("");

  const coincide = confirmacion.trim().toLowerCase() === businessName.trim().toLowerCase();

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />

      {state?.error && (
        <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-xs text-rose-300">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300">
          {state.ok}
        </p>
      )}

      <p className="text-[12px] leading-snug text-slate-400">
        Nadie de esta cuenta va a poder entrar, ni el dueño ni sus empleados. No se borra nada y se
        puede deshacer cuando quieras.
      </p>

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
          Por qué
        </span>
        <input
          name="reason"
          required
          placeholder="Ej: no pagó, o pidió que se la cerraran"
          className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
          Escribe <span className="text-slate-300">{businessName}</span> para confirmar
        </span>
        <input
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          autoComplete="off"
          className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-slate-600 focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={!coincide || pending}
        className="w-full rounded-lg border border-rose-800 px-3 py-2 text-sm font-bold text-rose-300 transition hover:border-rose-600 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
      >
        {pending ? "Suspendiendo..." : "Suspender esta cuenta"}
      </button>
    </form>
  );
}
