"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { reponerClaveAction } from "@/actions/admin";
import { Icon } from "./Icon";

function Boton({ chico }: { chico: boolean }) {
  const { pending } = useFormStatus();
  const base = chico
    ? "rounded-lg border px-2.5 py-1 text-[11px] font-bold transition "
    : "rounded-lg border px-3 py-1.5 text-xs font-bold transition ";
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        base +
        "border-slate-700 text-slate-300 hover:border-brand-500 hover:text-brand-300 disabled:opacity-50"
      }
    >
      {pending ? "Generando…" : "Reponer clave"}
    </button>
  );
}

/**
 * Le repone la clave a una cuenta desde el panel de la plataforma.
 *
 * No muestra ninguna contrasena, y es a proposito: lo que se genera es el
 * enlace de un solo uso, y la clave la escribe la persona. El administrador
 * nunca llega a saber la de un cliente.
 *
 * El enlace se muestra aunque el correo haya salido bien: es lo unico que
 * sirve cuando el correo se demora, cae en spam o el cliente escribio mal su
 * direccion al registrarse.
 */
export function ReponerClave({
  userId,
  staffId,
  nombre,
  chico = false,
}: {
  userId: string;
  /** Si viene, se le repone a esa persona; si no, al dueno de la cuenta. */
  staffId?: string;
  nombre: string;
  chico?: boolean;
}) {
  const [state, formAction] = useActionState(reponerClaveAction, undefined);
  const [copiado, setCopiado] = useState(false);

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles queda el texto a la vista para copiarlo a mano.
    }
  }

  return (
    <div className={chico ? "" : "space-y-3"}>
      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        {staffId && <input type="hidden" name="staffId" value={staffId} />}
        <Boton chico={chico} />
      </form>

      {state?.error && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-rose-300">
          <Icon name="alert" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{state.error}</span>
        </p>
      )}

      {state?.enlace && (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p
            className={
              "flex items-start gap-1.5 text-[11px] font-bold " +
              (state.enviado ? "text-emerald-300" : "text-amber-300")
            }
          >
            <Icon name={state.enviado ? "check" : "alert"} className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{state.ok}</span>
          </p>

          <p className="mt-2 text-[11px] text-slate-500">
            Enlace para {nombre}. Sirve una sola vez y se vence en una hora.
          </p>

          <div className="mt-1.5 flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-slate-900 px-2 py-1.5 text-[10px] leading-relaxed text-slate-300">
              {state.enlace}
            </code>
            <button
              type="button"
              onClick={() => copiar(state.enlace!)}
              className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-300 transition hover:border-brand-500 hover:text-brand-300"
            >
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
