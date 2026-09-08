"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/actions/auth";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, undefined);

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}

      <Field label="Correo">
        <input
          className="input"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="tucorreo@ejemplo.com"
        />
      </Field>

      <Field label="Contrasena">
        <input
          className="input"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="********"
        />
      </Field>

      <SubmitButton className="btn-primary w-full" pendingText="Entrando...">
        Entrar
      </SubmitButton>

      <p className="text-center text-sm text-slate-400">
        No tienes cuenta{" "}
        <Link href="/registro" className="link">
          crea una aqui
        </Link>
      </p>
    </form>
  );
}
