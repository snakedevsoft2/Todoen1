"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { loginAction } from "@/actions/auth";
import { SUPPORT_WHATSAPP } from "@/lib/support";
import { Icon } from "./Icon";

/** La G de Google, tal como pide su guia de marca. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

const ERRORES: Record<string, string> = {
  google: "El ingreso con Google no está disponible por ahora. Entra con tu correo y contraseña.",
  cancelado: "Cancelaste el ingreso con Google.",
  state: "El ingreso se venció. Inténtalo otra vez.",
  sinverificar: "Ese correo de Google no está verificado.",
  desactivado: "Tu usuario está desactivado. Pídele al dueño que lo active.",
};

/** Boton principal con su estado de carga. */
function BotonEntrar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="auth-btn-primary" disabled={pending}>
      {pending ? (
        <>
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden="true"
          />
          Entrando…
        </>
      ) : (
        "Iniciar sesión"
      )}
    </button>
  );
}

export function LoginForm({
  googleReady = false,
  error,
}: {
  /** true si estan puestas las credenciales de Google. */
  googleReady?: boolean;
  /** Motivo que vino de vuelta de Google, si algo fallo. */
  error?: string;
}) {
  const [state, formAction] = useActionState(loginAction, undefined);
  const [verClave, setVerClave] = useState(false);
  const [email, setEmail] = useState("");

  const aviso = state?.error ?? (error ? (ERRORES[error] ?? "No pudimos entrar con Google.") : null);
  // El error viene del correo o de la contrasena, asi que se marcan los dos.
  const conError = Boolean(state?.error);

  const ayuda =
    "https://wa.me/" +
    SUPPORT_WHATSAPP +
    "?text=" +
    encodeURIComponent(
      "Hola, olvidé mi contraseña de Todoen1." + (email ? "\n\nMi correo es: " + email : "")
    );

  return (
    <div className="w-full">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900">
        Bienvenido de nuevo
      </h1>
      <p className="mt-2 text-[15px] text-slate-500">Ingresa a tu cuenta para continuar.</p>

      {aviso && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] leading-relaxed text-rose-700"
        >
          <Icon name="alert" className="mt-px h-4 w-4 shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      <form action={formAction} className="mt-6 space-y-5">
        <div>
          <label htmlFor="email" className="auth-label">
            Correo electrónico
          </label>
          <input
            id="email"
            className={"auth-input" + (conError ? " auth-input-error" : "")}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@ejemplo.com"
            aria-invalid={conError}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="auth-label mb-0">
              Contraseña
            </label>
            {/* Todavia no hay recuperacion por correo: lo resuelve soporte,
                que es honesto y funciona hoy. */}
            <a href={ayuda} target="_blank" rel="noopener noreferrer" className="auth-link text-[13px]">
              ¿Olvidaste tu contraseña?
            </a>
          </div>

          <div className="relative">
            <input
              id="password"
              className={"auth-input pr-24" + (conError ? " auth-input-error" : "")}
              type={verClave ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              required
              placeholder="Tu contraseña"
              aria-invalid={conError}
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
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-slate-600">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="h-4 w-4 rounded border-slate-300 accent-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          />
          Recordarme
        </label>

        <BotonEntrar />
      </form>

      {googleReady && (
        <>
          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[13px] text-slate-400">o continúa con</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <a href="/auth/google" className="auth-btn-outline">
            <GoogleMark />
            Google
          </a>
        </>
      )}

      <p className="mt-8 text-center text-[14px] text-slate-500">
        ¿No tienes una cuenta?{" "}
        <Link href="/registro" className="auth-link">
          Crear cuenta
        </Link>
      </p>
    </div>
  );
}
