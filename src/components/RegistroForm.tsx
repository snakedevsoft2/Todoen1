"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { registerAction } from "@/actions/auth";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";

const TYPES = [
  { value: "BARBERIA", label: "Barberia", hint: "Turnos, cortes y caja" },
  { value: "RESTAURANTE", label: "Restaurante", hint: "Cuentas por mesa y caja" },
  { value: "COMIDAS_RAPIDAS", label: "Comidas rapidas", hint: "Venta al mostrador y caja" },
  { value: "ROPA", label: "Tienda de ropa", hint: "Inventario por talla y catalogo" },
];

export function RegistroForm() {
  const [state, formAction] = useActionState(registerAction, undefined);
  const [type, setType] = useState("BARBERIA");

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}

      <div>
        <span className="label">Tipo de negocio</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={
                "cursor-pointer rounded-xl border-2 p-3 text-center transition " +
                (type === t.value
                  ? "border-edge bg-brand-600 text-on-brand shadow-block"
                  : "border-edge bg-panel hover:bg-surface")
              }
            >
              <input
                type="radio"
                name="businessType"
                value={t.value}
                checked={type === t.value}
                onChange={() => setType(t.value)}
                className="sr-only"
              />
              <span className="block text-sm font-bold">{t.label}</span>
              <span className="mt-0.5 block text-[11px] opacity-75">{t.hint}</span>
            </label>
          ))}
        </div>
      </div>

      <Field label="Nombre del negocio">
        <input className="input" name="businessName" required placeholder="Barberia El Estilo" />
      </Field>

      <Field label="Tu nombre">
        <input className="input" name="ownerName" required placeholder="Luis Ramirez" />
      </Field>

      <Field label="Telefono (opcional)">
        <input className="input" name="phone" inputMode="tel" placeholder="300 000 0000" />
      </Field>

      <Field label="Correo">
        <input
          className="input"
          type="email"
          name="email"
          required
          inputMode="email"
          autoComplete="email"
          placeholder="tucorreo@ejemplo.com"
        />
      </Field>

      <Field label="Contrasena" hint="Minimo 6 caracteres.">
        <input
          className="input"
          type="password"
          name="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </Field>

      <SubmitButton className="btn-primary w-full" pendingText="Creando cuenta...">
        Crear cuenta
      </SubmitButton>

      <p className="text-center text-sm text-muted">
        Ya tienes cuenta{" "}
        <Link href="/login" className="link">
          entra aqui
        </Link>
      </p>
    </form>
  );
}
