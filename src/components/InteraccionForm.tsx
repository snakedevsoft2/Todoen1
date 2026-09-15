"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { anotarInteraccionAction } from "@/actions/crm";
import { INTERACCIONES, type TipoInteraccion } from "@/lib/crm";
import { SubmitButton } from "./SubmitButton";
import { Alert } from "./ui";
import { useAccionSinSenal } from "@/components/SinSenal";

/** Anotar lo que paso con el cliente: una llamada, un WhatsApp, una nota. */
export function InteraccionForm({ customerId }: { customerId: string }) {
  const [state, formAction] = useActionState(useAccionSinSenal("anotarInteraccionAction", anotarInteraccionAction), undefined);
  const [kind, setKind] = useState<TipoInteraccion>("LLAMADA");
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={formAction} className="space-y-3">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Qué pasó">
        {INTERACCIONES.map((i) => (
          <button
            key={i.key}
            type="button"
            role="radio"
            aria-checked={kind === i.key}
            onClick={() => setKind(i.key)}
            className={
              "rounded-full border px-3 py-1 text-[13px] font-semibold transition-all duration-150 active:scale-95 " +
              (kind === i.key
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-line-strong bg-panel text-body hover:border-brand-400")
            }
          >
            {i.label}
          </button>
        ))}
      </div>

      <textarea
        className="input min-h-[72px]"
        name="text"
        required
        maxLength={2000}
        aria-label="Qué pasó"
        placeholder={
          kind === "NOTA" ? "Algo para recordar de este cliente" : "Qué hablaron y en qué quedaron"
        }
      />

      {state?.error && <Alert kind="error">{state.error}</Alert>}
      <SubmitButton className="btn-primary btn-sm" pendingText="Anotando...">
        Anotar
      </SubmitButton>
    </form>
  );
}
