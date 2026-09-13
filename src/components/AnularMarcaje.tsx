"use client";

import { useActionState, useState } from "react";
import { anularMarcajeAction } from "@/actions/asistencia";
import { SubmitButton } from "./SubmitButton";

/**
 * Anular un marcaje equivocado.
 *
 * Pide el motivo antes de dejar anular, y no por tramite: el motivo es lo que
 * queda escrito al lado del marcaje original. Sin el, dentro de tres meses
 * nadie sabria por que se tacho, y una planilla que no se puede explicar no
 * sirve de prueba.
 */
export function AnularMarcaje({ id }: { id: string }) {
  const [state, formAction] = useActionState(anularMarcajeAction, undefined);
  const [abierto, setAbierto] = useState(false);

  if (state?.ok) return <span className="text-[11px] text-good">Anulado</span>;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-[11px] text-subtle underline transition-colors hover:text-bad"
      >
        Anular
      </button>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        className="input h-9 min-w-0 flex-1 py-1.5 text-[13px]"
        name="reason"
        required
        autoFocus
        placeholder="¿Por qué lo anulas?"
      />
      <SubmitButton className="btn-danger btn-sm" pendingText="...">
        Anular
      </SubmitButton>
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="text-[11px] text-subtle underline"
      >
        Cancelar
      </button>
      {state?.error && <p className="w-full text-[11px] text-bad">{state.error}</p>}
    </form>
  );
}
