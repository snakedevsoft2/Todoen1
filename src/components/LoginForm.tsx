"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { loginAction } from "@/actions/auth";
import { SUPPORT_WHATSAPP_PRETTY } from "@/lib/support";
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

/** La f de Facebook, en su azul. */
function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        fill="#fff"
        d="M13.4 19.5v-6.2h2.1l.3-2.4h-2.4V9.4c0-.7.2-1.2 1.2-1.2h1.3V6c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3v1.8H8.7v2.4h2.1v6.2h2.6Z"
      />
    </svg>
  );
}

const ERRORES: Record<string, string> = {
  google: "El ingreso con Google no está disponible por ahora. Entra con tu correo y contraseña.",
  facebook: "El ingreso con Facebook no está disponible por ahora. Entra con tu correo y contraseña.",
  sincorreo:
    "Tu cuenta de Facebook no tiene un correo confirmado, así que no hay con qué buscar tu negocio. Entra con tu correo y contraseña.",
  suspendida: "Tu cuenta está suspendida. Escríbenos al " + SUPPORT_WHATSAPP_PRETTY + " para reactivarla.",
  cancelado: "Cancelaste el ingreso.",
  state: "El ingreso se venció. Inténtalo otra vez.",
  sinverificar: "Ese correo de Google no está verificado.",
  desactivado: "Tu usuario está desactivado. Pídele al dueño que lo active.",
};

/** Boton principal con su estado de carga. */
function BotonEntrar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="auth-btn-primary bg-brand-600 hover:bg-brand-700" disabled={pending}>
      {pending ? (
        <>
          <span
            className="h-4 w-4 animate-spin rounded-full border border-white/30 border-t-white"
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
  facebookReady = false,
  resetReady = false,
  error,
  cambiada = false,
}: {
  /** true si estan puestas las credenciales de Google. */
  googleReady?: boolean;
  /** true si estan puestas las credenciales de Facebook. */
  facebookReady?: boolean;
  /** true si hay servicio de correo para mandar el enlace de recuperar. */
  resetReady?: boolean;
  /** Motivo que vino de vuelta de Google, si algo fallo. */
  error?: string;
  /** true si acaba de cambiar su contrasena con el enlace del correo. */
  cambiada?: boolean;
}) {
  const [state, formAction] = useActionState(loginAction, undefined);
  const [verClave, setVerClave] = useState(false);
  const [email, setEmail] = useState("");
  // Sin arroba es el usuario de un empleado: entra sin contraseña.
  const conUsuario = email.trim() !== "" && !email.includes("@");

  /*
   * Al llegar al ingreso se borran las paginas guardadas para abrir sin senal.
   * Llevan el nombre y los marcajes de quien estaba adentro, y el siguiente
   * que entre en este telefono no tiene por que verlos. La cola de marcajes
   * pendientes NO se toca: esos todavia tienen que salir.
   */
  useEffect(() => {
    if (typeof caches === "undefined") return;
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("ten-paginas")).map((k) => caches.delete(k))))
      .catch(() => {});
  }, []);

  const aviso = state?.error ?? (error ? (ERRORES[error] ?? "No pudimos completar el ingreso.") : null);
  // El error viene del correo o de la contrasena, asi que se marcan los dos.
  const conError = Boolean(state?.error);

  return (
    <div className="w-full">
      <h1 className="text-center text-[26px] font-bold leading-tight tracking-[-0.02em] text-slate-900">
        Iniciar sesión
      </h1>

      {/* Viene de /recuperar/[token]. Se muestra hasta que intente entrar: si
          la accion devuelve un error, ese manda. */}
      {cambiada && !aviso && (
        <div
          role="status"
          className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] leading-relaxed text-emerald-700"
        >
          <Icon name="check" className="mt-px h-4 w-4 shrink-0" />
          <span>Listo, tu contraseña quedó cambiada. Entra con la nueva.</span>
        </div>
      )}

      {aviso && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] leading-relaxed text-rose-700"
        >
          <Icon name="alert" className="mt-px h-4 w-4 shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      {(googleReady || facebookReady) && (
        <>
          <div className={"mt-6 " + (googleReady && facebookReady ? "grid grid-cols-2 gap-3" : "")}>
            {googleReady && (
              <a href="/auth/google" className="auth-btn-outline">
                <GoogleMark />
                Google
              </a>
            )}
            {facebookReady && (
              <a href="/auth/facebook" className="auth-btn-outline">
                <FacebookMark />
                Facebook
              </a>
            )}
          </div>

          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[13px] text-slate-400">o</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      )}

      <form action={formAction} className="mt-6 space-y-5">
        <div>
          <label htmlFor="email" className="auth-label">
            Correo o usuario
          </label>
          <input
            id="email"
            className={"auth-input" + (conError ? " auth-input-error" : "")}
            type="text"
            name="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@ejemplo.com o tu usuario"
            aria-invalid={conError}
          />
        </div>

        {conUsuario ? (
          <p className="rounded-[10px] bg-slate-50 px-3.5 py-3 text-[13px] leading-relaxed text-slate-600" data-ingreso-usuario>
            Entras con tu usuario de empleado, sin contraseña.
          </p>
        ) : (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="auth-label mb-0">
              Contraseña
            </label>
            {/* Con correo configurado la persona se destranca sola. Sin el, el
                boton mandaria a una pantalla que no puede mandar nada, asi que
                se cae a soporte, que es lo que funciona ese dia. */}
            {/* Con correo configurado va al enlace por correo. Sin correo va a
                la pregunta de seguridad, que no depende de ningun servicio: la
                persona siempre tiene un camino propio antes de escribirnos. */}
            <Link
              href={
                (resetReady ? "/recuperar" : "/recuperar/pregunta") +
                (email ? "?email=" + encodeURIComponent(email) : "")
              }
              className="auth-link text-[13px]"
            >
              ¿Olvidaste tu contraseña?
            </Link>
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
        )}

        <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-slate-600">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="h-4 w-4 rounded border-slate-300 accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          />
          Recordarme
        </label>

        <BotonEntrar />
      </form>

      <p className="mt-6 text-center text-[14px]">
        <Link href="/recuperar/pregunta" className="auth-link">
          ¿No puedes ingresar a tu cuenta?
        </Link>
      </p>

      <p className="mt-3 text-center text-[14px] text-slate-500">
        ¿No tienes una cuenta?{" "}
        <Link href="/registro" className="auth-link">
          Crear cuenta
        </Link>
      </p>
    </div>
  );
}
