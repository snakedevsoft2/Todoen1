"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { pedirEnlaceAction } from "@/actions/recuperar";
import { SUPPORT_WHATSAPP } from "@/lib/support";
import { Icon } from "./Icon";

function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="auth-btn-primary" disabled={pending}>
      {pending ? (
        <>
          <span
            className="h-4 w-4 animate-spin rounded-full border border-white/30 border-t-white"
            aria-hidden="true"
          />
          Enviando…
        </>
      ) : (
        "Enviarme el enlace"
      )}
    </button>
  );
}

/**
 * Paso 1 de recuperar la clave: decir a que correo mandamos el enlace.
 *
 * Cuando sale bien no se deja el formulario ahi: se cambia por el aviso de
 * "revisa tu correo". Dejarlo invitaria a darle enviar otra vez y a quemar el
 * enlace que acaba de llegar.
 */
export function PedirEnlaceForm({
  /** Correo que traia la pantalla de ingreso, para no volverlo a escribir. */
  defaultEmail = "",
}: {
  defaultEmail?: string;
}) {
  const [state, formAction] = useActionState(pedirEnlaceAction, undefined);
  const [email, setEmail] = useState(defaultEmail);

  const ayuda =
    "https://wa.me/" +
    SUPPORT_WHATSAPP +
    "?text=" +
    encodeURIComponent(
      "Hola, no puedo entrar a Todoen1." + (email ? "\n\nMi correo es: " + email : "")
    );

  if (state?.ok) {
    return (
      <div className="w-full">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Icon name="check" className="h-6 w-6" />
        </div>

        <h1 className="mt-5 text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900">
          Revisa tu correo
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-500">{state.ok}</p>

        <div className="mt-6 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3.5 text-[13px] leading-relaxed text-slate-600">
          ¿No te llegó? Mira en <strong className="font-semibold">spam</strong> o{" "}
          <strong className="font-semibold">correo no deseado</strong>. Si tampoco está ahí, puede
          que ese correo no tenga cuenta: prueba con el otro que uses.
        </div>

        <Link href="/login" className="auth-btn-outline mt-6">
          Volver a ingresar
        </Link>

        <p className="mt-6 text-center text-[13px] text-slate-500">
          ¿Sigues trancado?{" "}
          <a href={ayuda} target="_blank" rel="noopener noreferrer" className="auth-link">
            Escríbenos por WhatsApp
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900">
        ¿Olvidaste tu contraseña?
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
        Escribe el correo con el que entras y te mandamos un enlace para poner una nueva.
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
        <div>
          <label htmlFor="email" className="auth-label">
            Correo electrónico
          </label>
          <input
            id="email"
            className={"auth-input" + (state?.error ? " auth-input-error" : "")}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@ejemplo.com"
            aria-invalid={Boolean(state?.error)}
          />
          <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
            Sirve igual si eres el dueño del negocio o si entras como barbero o empleado.
          </p>
        </div>

        <BotonEnviar />
      </form>

      <p className="mt-8 text-center text-[14px] text-slate-500">
        ¿Ya te acordaste?{" "}
        <Link href="/login" className="auth-link">
          Volver a ingresar
        </Link>
      </p>
    </div>
  );
}
