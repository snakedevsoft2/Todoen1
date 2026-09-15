"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { alternarEtiquetaAction, crearEtiquetaAction } from "@/actions/crm";
import { COLORES_ETIQUETA } from "@/lib/crm";
import { SubmitButton } from "./SubmitButton";
import { Alert } from "./ui";
import { FormSinSenal } from "@/components/SinSenal";
import { useAccionSinSenal } from "@/components/SinSenal";

export type Etiqueta = { id: string; name: string; color: string };

/** Una etiqueta como pastilla. Llena si esta puesta, con borde si no. */
export function Pastilla({ etiqueta, puesta = true }: { etiqueta: Etiqueta; puesta?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-semibold"
      style={{
        backgroundColor: puesta ? etiqueta.color : "transparent",
        borderColor: etiqueta.color,
        color: puesta ? "#fff" : etiqueta.color,
      }}
    >
      {etiqueta.name}
    </span>
  );
}

/**
 * Las etiquetas de un cliente: se tocan para poner o quitar, y se crean ahi
 * mismo sin ir a otra pantalla.
 */
export function EtiquetasCliente({
  customerId,
  todas,
  puestas,
}: {
  customerId: string;
  todas: Etiqueta[];
  puestas: string[];
}) {
  const [state, formAction] = useActionState(useAccionSinSenal("crearEtiquetaAction", crearEtiquetaAction), undefined);
  const [color, setColor] = useState(COLORES_ETIQUETA[0]);
  const form = useRef<HTMLFormElement>(null);
  const activas = new Set(puestas);

  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <div className="space-y-3">
      {todas.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {todas.map((t) => {
            const on = activas.has(t.id);
            return (
              <li key={t.id}>
                <FormSinSenal accion="alternarEtiquetaAction" servidor={alternarEtiquetaAction}>
                  <input type="hidden" name="customerId" value={customerId} />
                  <input type="hidden" name="tagId" value={t.id} />
                  <button
                    type="submit"
                    aria-pressed={on}
                    className="transition-transform duration-150 active:scale-95"
                    title={on ? "Quitar " + t.name : "Poner " + t.name}
                  >
                    <Pastilla etiqueta={t} puesta={on} />
                  </button>
                </FormSinSenal>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Crea la primera: VIP, frecuente, mayorista, moroso...</p>
      )}

      <form ref={form} action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="color" value={color} />
        <input
          className="input h-9 min-w-0 flex-1 basis-40 py-1 text-sm"
          name="name"
          maxLength={30}
          required
          placeholder="Nueva etiqueta"
          aria-label="Nombre de la etiqueta nueva"
        />
        <div className="flex gap-1" role="radiogroup" aria-label="Color">
          {COLORES_ETIQUETA.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={"Color " + c}
              onClick={() => setColor(c)}
              className={
                "h-6 w-6 rounded-full transition-transform duration-150 " +
                (color === c ? "scale-110 ring-2 ring-offset-2 ring-offset-panel" : "hover:scale-110")
              }
              style={{ backgroundColor: c, ["--tw-ring-color" as string]: c }}
            />
          ))}
        </div>
        <SubmitButton className="btn-ghost btn-sm" pendingText="...">
          Crear
        </SubmitButton>
      </form>
      {state?.error && <Alert kind="error">{state.error}</Alert>}
    </div>
  );
}
