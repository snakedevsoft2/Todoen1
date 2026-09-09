"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { loginAction } from "@/actions/auth";
import { SUPPORT_WHATSAPP_PRETTY, SUPPORT_WHATSAPP } from "@/lib/support";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, undefined);
  const [verClave, setVerClave] = useState(false);
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}

      <Field label="Correo">
        <div className="relative">
          <input
            className="input pl-10"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@ejemplo.com"
          />
          <Icon
            name="user"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
          />
        </div>
      </Field>

      <Field label="Contrasena">
        <div className="relative">
          <input
            className="input pl-10 pr-12"
            type={verClave ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
            placeholder="Tu contrasena"
          />
          <Icon
            name="lock"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
          />
          {/* En el celular uno se equivoca escribiendo: poder mirarla evita
              intentos fallidos y llamadas a soporte. */}
          <button
            type="button"
            onClick={() => setVerClave(!verClave)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-muted transition hover:text-strong"
            aria-label={verClave ? "Ocultar contrasena" : "Ver contrasena"}
          >
            {verClave ? "Ocultar" : "Ver"}
          </button>
        </div>
      </Field>

      <SubmitButton className="btn-primary w-full" pendingText="Entrando...">
        <Icon name="logout" className="h-4 w-4 rotate-180" />
        Entrar
      </SubmitButton>

      <p className="text-center text-sm text-muted">
        No tienes cuenta{" "}
        <Link href="/registro" className="link">
          crea una aqui
        </Link>
      </p>

      <div className="border-t-2 border-edge pt-3 text-center">
        <a
          href={
            "https://wa.me/" +
            SUPPORT_WHATSAPP +
            "?text=" +
            encodeURIComponent(
              "Hola, no puedo entrar a TODO EN UNO." +
                (email ? "\n\nMi correo es: " + email : "")
            )
          }
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-good"
        >
          <Icon name="whatsapp" className="h-4 w-4" />
          No puedo entrar - soporte {SUPPORT_WHATSAPP_PRETTY}
        </a>
      </div>
    </form>
  );
}
