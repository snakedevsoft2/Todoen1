"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText,
  confirm,
  disabled,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  confirm?: string;
  disabled?: boolean;
  /** Para los botones que solo muestran un icono o un signo. */
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={className}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending ? pendingText ?? "Guardando..." : children}
    </button>
  );
}
