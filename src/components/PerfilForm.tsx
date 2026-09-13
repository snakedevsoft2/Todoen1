"use client";

/* eslint-disable @next/next/no-img-element */

import { useActionState, useRef, useState } from "react";
import { guardarPerfilAction } from "@/actions/perfil";
import { fileToDataUrl } from "@/lib/image";
import { initials } from "@/lib/staff";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

/**
 * Editar el propio perfil, con foto.
 *
 * La foto se achica en el telefono a un tamaño de avatar antes de subirla:
 * una foto de celular pesa varios megas y aqui se ve en un circulo de 40
 * pixeles.
 */
export function PerfilForm({
  inicial,
}: {
  inicial: { name: string; phone: string | null; email: string | null; color: string; fotoUrl: string | null };
}) {
  const [state, formAction] = useActionState(guardarPerfilAction, undefined);
  const [foto, setFoto] = useState<string | null>(null);
  const [quitada, setQuitada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const mostrada = foto ?? (quitada ? null : inicial.fotoUrl);
  const valor = foto ?? (quitada ? "__borrar__" : "");

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    try {
      setFoto(await fileToDataUrl(archivo, { maxSide: 480, maxBytes: 150 * 1024 }));
      setQuitada(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la foto.");
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="photo" value={valor} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
        {mostrada ? (
          <img src={mostrada} alt="Tu foto" data-foto-perfil className="h-24 w-24 rounded-full object-cover shadow-card" />
        ) : (
          <span
            className="flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold text-white shadow-card"
            style={{ backgroundColor: inicial.color }}
            aria-hidden
          >
            {initials(inicial.name)}
          </span>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => entrada.current?.click()}>
            <Icon name="image" className="h-4 w-4" />
            {mostrada ? "Cambiar foto" : "Poner foto"}
          </button>
          {mostrada && (
            <button
              type="button"
              className="btn-ghost btn-sm text-bad"
              onClick={() => {
                setFoto(null);
                setQuitada(true);
              }}
            >
              Quitar
            </button>
          )}
          <input
            ref={entrada}
            type="file"
            name="archivo-foto"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              void elegir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      {error && <p className="text-center text-[12px] text-bad">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tu nombre">
          <input className="input" name="name" required maxLength={80} defaultValue={inicial.name} />
        </Field>
        <Field label="Teléfono">
          <input className="input" name="phone" inputMode="tel" maxLength={40} defaultValue={inicial.phone ?? ""} />
        </Field>
      </div>
      {inicial.email && (
        <p className="text-[12px] text-muted">
          Entras con <strong className="text-body">{inicial.email}</strong>.
        </p>
      )}

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        Guardar mi perfil
      </SubmitButton>
    </form>
  );
}
