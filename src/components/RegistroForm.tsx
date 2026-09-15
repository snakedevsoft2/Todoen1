"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { registerAction } from "@/actions/auth";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { PaisMonedaZona } from "./PaisMonedaZona";

const TYPES = [
  { value: "BARBERIA", label: "Barbería", hint: "Turnos, cortes y caja" },
  { value: "RESTAURANTE", label: "Restaurante", hint: "Cuentas por mesa y caja" },
  { value: "COMIDAS_RAPIDAS", label: "Comidas rápidas", hint: "Venta al mostrador y caja" },
  { value: "ROPA", label: "Tienda de ropa", hint: "Inventario por talla y catálogo" },
  { value: "CARTERA", label: "Cartera y cobranza", hint: "Préstamos por cuotas y cobros" },
  {
    value: "ASISTENCIA",
    label: "Gestor de asistencia",
    hint: "Personal, marcaje con ubicación y reportes",
  },
  // Va de ultimo a proposito: primero que intente reconocerse en los de
  // arriba, que le quedan mejor armados. Este es la salida para el resto.
  { value: "OTRO", label: "Otro negocio", hint: "Lo armas tú mismo" },
];

/** Un nombre de ejemplo que se parezca al negocio que eligio. */
const EJEMPLO_NOMBRE: Record<string, string> = {
  BARBERIA: "Ej: Barbería El Estilo",
  RESTAURANTE: "Ej: Restaurante La Sazón",
  COMIDAS_RAPIDAS: "Ej: Perros y Hamburguesas Don Pepe",
  ROPA: "Ej: Boutique Valentina",
  CARTERA: "Ej: Inversiones La Confianza",
  ASISTENCIA: "Ej: Servicios de Aseo Total",
  OTRO: "Ej: Mi negocio",
};

export function RegistroForm({
  defaultEmail,
  defaultName,
}: {
  /** Vienen de Google cuando la persona entro por ahi y no tenia cuenta. */
  defaultEmail?: string;
  defaultName?: string;
} = {}) {
  const [state, formAction] = useActionState(registerAction, undefined);
  const [type, setType] = useState("BARBERIA");

  return (
    <form action={formAction} className="card space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}

      <div>
        <span className="label">Tipo de negocio</span>
        {/*
          Tres columnas como maximo: el formulario nunca pasa de unos 450 px
          de ancho, y con cinco columnas "Restaurante" ya no cabia en su
          casilla aunque la pantalla fuera grande.
        */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TYPES.map((t) => (
            <label
              key={t.value}
              data-tipo={t.value}
              className={
                "flex min-w-0 cursor-pointer flex-col items-center rounded-xl border px-2 py-3 text-center transition " +
                (type === t.value
                  ? "border-transparent bg-brand-600 text-on-brand shadow-soft"
                  : "border-line bg-panel hover:bg-surface")
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
              <span className="block max-w-full text-[13px] font-bold leading-tight [overflow-wrap:anywhere] [hyphens:auto]" lang="es">
                {t.label}
              </span>
              <span className="mt-1 block max-w-full text-[11px] leading-snug opacity-75 [overflow-wrap:anywhere]">{t.hint}</span>
            </label>
          ))}
        </div>
      </div>

      <PaisMonedaZona registro />

      <Field label="Nombre del negocio">
        <input className="input" name="businessName" required placeholder={EJEMPLO_NOMBRE[type] ?? "Ej: Mi negocio"} />
      </Field>

      <Field label="Tu nombre">
        <input className="input" name="ownerName" required defaultValue={defaultName} placeholder="Luis Ramirez" />
      </Field>

      <Field label="Teléfono (opcional)">
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
          defaultValue={defaultEmail}
          placeholder="tucorreo@ejemplo.com"
        />
      </Field>

      <Field label="Contraseña" hint="Mínimo 6 caracteres.">
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
