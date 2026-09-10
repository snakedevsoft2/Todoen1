"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { finishTourAction } from "@/actions/tour";
import type { TourStep } from "@/lib/tour";
import { Icon } from "./Icon";

/**
 * Instructivo de bienvenida.
 *
 * Aparece encima del resumen la primera vez que alguien entra. Se puede omitir
 * en cualquier momento, y omitirlo cuenta igual que terminarlo: la persona ya
 * decidio. Desde Ajustes lo puede volver a abrir cuando quiera.
 */
export function GuiaInicial({
  steps,
  businessName,
  personName,
}: {
  steps: TourStep[];
  businessName: string;
  personName: string;
}) {
  const [index, setIndex] = useState(0);
  const [cerrado, setCerrado] = useState(false);
  const [pending, startTransition] = useTransition();

  if (cerrado || steps.length === 0) return null;

  const step = steps[index];
  const primero = index === 0;
  const ultimo = index === steps.length - 1;

  /** Cerramos de una y guardamos por detras: nadie espera a un instructivo. */
  function terminar() {
    setCerrado(true);
    startTransition(() => {
      finishTourAction();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Instructivo de bienvenida"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-line bg-panel sm:rounded-2xl sm:shadow-soft-lg">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-brand-600">
              {primero ? "Bienvenido" : "Paso " + (index + 1) + " de " + steps.length}
            </p>
            <p className="mt-1 truncate font-display text-lg leading-tight text-strong">
              {primero ? "Hola, " + personName.split(" ")[0] : businessName}
            </p>
          </div>
          <button
            type="button"
            onClick={terminar}
            disabled={pending}
            className="btn-ghost btn-sm shrink-0"
          >
            Omitir
          </button>
        </header>

        <div className="px-5 py-6">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-brand-600 text-on-brand shadow-soft">
            <Icon name={step.icon} className="h-6 w-6" />
          </span>

          <h2 className="mt-4 font-display text-[22px] leading-tight text-strong">{step.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-body">{step.text}</p>

          {step.href && step.action && (
            <Link
              href={step.href}
              onClick={terminar}
              className="btn-soft btn-sm mt-4 inline-flex"
            >
              <Icon name="link" className="h-4 w-4" />
              {step.action}
            </Link>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={
                  "h-2 rounded-full transition-all " +
                  (i === index ? "w-6 bg-brand-600" : "w-2 bg-line-strong")
                }
              />
            ))}
          </div>

          <div className="flex gap-2">
            {!primero && (
              <button
                type="button"
                onClick={() => setIndex(index - 1)}
                className="btn-ghost btn-sm"
              >
                Atras
              </button>
            )}
            {ultimo ? (
              <button
                type="button"
                onClick={terminar}
                disabled={pending}
                className="btn-primary btn-sm"
              >
                <Icon name="check" className="h-4 w-4" />
                Empezar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIndex(index + 1)}
                className="btn-primary btn-sm"
              >
                Siguiente
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
