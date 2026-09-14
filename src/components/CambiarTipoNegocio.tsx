"use client";

import { startTransition, useActionState, useState } from "react";
import { cambiarMiTipoAction, cambiarTipoAdminAction } from "@/actions/tipo-negocio";
import { Alert } from "./ui";

type Opcion = { value: string; label: string; hint: string };

/**
 * Cambiar el tipo de negocio sin crear otra cuenta.
 *
 * Para quien se equivoco al registrarse: eligio "Tienda de ropa" y tiene una
 * barberia. Se explica antes que pasa (cambia el menu, no se borra nada) y se
 * pide confirmar con la casilla.
 */
export function CambiarTipoNegocio({
  actual,
  opciones,
  userId,
}: {
  actual: string;
  opciones: Opcion[];
  /** Si viene, lo usa el administrador de la plataforma sobre esa cuenta. */
  userId?: string;
}) {
  const admin = Boolean(userId);
  const [state, formAction, pending] = useActionState(admin ? cambiarTipoAdminAction : cambiarMiTipoAction, undefined);
  const [elegido, setElegido] = useState(actual);
  const nuevo = opciones.find((o) => o.value === elegido);
  const cambia = elegido !== actual;

  const texto = admin ? "text-slate-300" : "text-body";
  const tenue = admin ? "text-slate-500" : "text-muted";

  return (
    <form
      // Se envia a mano y no con action={...}: React reinicia el formulario
      // despues de la accion, y el selector volvia al tipo de antes mientras
      // el texto seguia diciendo el nuevo. Asi, lo que se ve es lo que se manda.
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => formAction(datos));
      }}
      className="space-y-3"
      data-cambiar-tipo
    >
      {userId && <input type="hidden" name="userId" value={userId} />}
      {state?.error && (admin ? <p className="text-sm text-rose-300">{state.error}</p> : <Alert kind="error">{state.error}</Alert>)}
      {state?.ok && (admin ? <p className="text-sm text-emerald-300">{state.ok}</p> : <Alert kind="ok">{state.ok}</Alert>)}

      <label className="block">
        <span className={admin ? "text-[11px] uppercase tracking-wide text-slate-500" : "label"}>Tipo de negocio</span>
        <select
          name="businessType"
          value={elegido}
          onChange={(e) => setElegido(e.target.value)}
          className={
            admin
              ? "mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              : "input"
          }
        >
          {opciones.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.value === actual ? " (el de ahora)" : ""}
            </option>
          ))}
        </select>
      </label>

      {cambia && nuevo && (
        <>
          <ul className={"space-y-1.5 text-[13px] leading-snug " + texto}>
            <li>• El menú pasa a ser el de {nuevo.label.toLowerCase()}: {nuevo.hint.toLowerCase()}.</li>
            <li>• No se borra nada: ventas, turnos, deudas y clientes siguen guardados. Si vuelves al tipo de antes, reaparecen.</li>
            <li>• El equipo conserva sus usuarios y claves; solo cambia cómo se llama su rol.</li>
            <li>• {admin ? "El dueño verá" : "Verás"} otra vez la bienvenida para armar el menú del negocio nuevo.</li>
          </ul>
          <label className={"flex items-start gap-2 text-sm " + texto}>
            <input type="checkbox" name="confirmo" className="mt-0.5 h-4 w-4" />
            <span>
              Sí, cambiar a <strong>{nuevo.label}</strong>
            </span>
          </label>
        </>
      )}

      <button
        type="submit"
        disabled={!cambia || pending}
        className={
          admin
            ? "w-full rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-brand-500 disabled:opacity-40"
            : "btn-primary w-full sm:w-auto"
        }
      >
        {pending ? "Cambiando…" : "Cambiar tipo de negocio"}
      </button>
      {!cambia && <p className={"text-[12px] " + tenue}>Elige el tipo correcto para ver qué cambia.</p>}
    </form>
  );
}
