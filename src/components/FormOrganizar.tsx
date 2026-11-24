"use client";

import { useActionState, type ReactNode } from "react";
import { organizarMbNailsAction } from "@/actions/organizar-mb";
import { SubmitButton } from "./SubmitButton";
import { Alert } from "./ui";

/** El formulario de Organizar MB Nails: el plan lo arma el servidor (children). */
export function FormOrganizar({ children, hayAlgo }: { children: ReactNode; hayAlgo: boolean }) {
  const [state, formAction] = useActionState(organizarMbNailsAction, undefined);
  return (
    <form action={formAction} className="space-y-4" data-organizar>
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
      {children}
      {hayAlgo && (
        <SubmitButton className="btn-primary w-full justify-center py-3 text-base sm:w-auto" pendingText="Organizando…">
          Aplicar
        </SubmitButton>
      )}
    </form>
  );
}
