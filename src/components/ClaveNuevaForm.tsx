"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { cambiarConEnlaceAction } from "@/actions/recuperar";
import { Icon } from "./Icon";

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="auth-btn-primary" disabled={pending}>
      {pending ? (
        <>
          <span
            className="h-4 w-4 animate-spin rounded-full border border-white/30 border-t-white"
            aria-hidden="true"
          />
          Guardando…
        </>
      ) : (
        "Guardar contraseña"
      )}
    </button>
  );
}

/**
 * Paso 2: la contrasena nueva, con el enlace ya comprobado.
 *
 * El token viaja en un campo escondido y no se vuelve a leer de la direccion:
 * asi la accion recibe siempre el mismo que valido la pagina.
 *
 * Las dos casillas se muestran u ocultan juntas: son la misma contrasena y
 * quien la quiere ver es para compararlas.
 */
export function ClaveNuevaForm({
  token,
  correo,
  minimo,
}: {
  token: string;
  correo: string;
  /**
   * Largo minimo de la contrasena. Llega como propiedad y no importado de
   * lib/reset porque ese archivo habla con la base de datos, y esta pantalla
   * corre en el navegador: importarlo se traeria Prisma al paquete del cliente.
   * Quien manda sigue siendo el servidor, que lo vuelve a revisar en la accion.
   */
  minimo: number;
}) {
  const [state, formAction] = useActionState(cambiarConEnlaceAction, undefined);
  const [verClave, setVerClave] = useState(false);
  const [clave, setClave] = useState("");
  const [confirma, setConfirma] = useState("");

  const corta = clave.length > 0 && clave.length < minimo;
  const distintas = confirma.length > 0 && clave !== confirma;

  return (
    <div className="w-full">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon name="lock" className="h-6 w-6" />
      </div>

      <h1 className="mt-5 text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900">
        Pon tu contraseña nueva
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
        Estás cambiando la contraseña de <strong className="font-semibold text-slate-700">{correo}</strong>.
      </p>

      {state?.error && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] leading-relaxed text-rose-700"
        >
          <Icon name="alert" className="mt-px h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={formAction} className="mt-6 space-y-5">
        <input type="hidden" name="token" value={token} />

        <div>
          <label htmlFor="password" className="auth-label">
            Contraseña nueva
          </label>
          <div className="relative">
            <input
              id="password"
              className={"auth-input pr-24" + (corta ? " auth-input-error" : "")}
              type={verClave ? "text" : "password"}
              name="password"
              autoComplete="new-password"
              required
              minLength={minimo}
              autoFocus
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder={"Al menos " + minimo + " caracteres"}
              aria-invalid={corta}
            />
            <button
              type="button"
              onClick={() => setVerClave(!verClave)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[7px] px-2.5 py-1.5 text-[13px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {verClave ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          {corta && (
            <p className="mt-2 text-[13px] text-rose-600">
              Le faltan {minimo - clave.length} caracteres.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="auth-label">
            Repite la contraseña
          </label>
          <input
            id="confirmPassword"
            className={"auth-input" + (distintas ? " auth-input-error" : "")}
            type={verClave ? "text" : "password"}
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            placeholder="La misma de arriba"
            aria-invalid={distintas}
          />
          {distintas && <p className="mt-2 text-[13px] text-rose-600">Las dos no coinciden.</p>}
        </div>

        <BotonGuardar />
      </form>

      <p className="mt-6 text-[13px] leading-relaxed text-slate-400">
        Al guardarla, este enlace deja de servir y entras con la contraseña nueva.
      </p>
    </div>
  );
}
