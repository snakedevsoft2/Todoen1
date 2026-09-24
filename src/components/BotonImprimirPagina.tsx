"use client";

import { Icon } from "./Icon";

/** Imprime la pantalla tal cual, con las reglas @media print de globals.css. */
export function BotonImprimirPagina({ label = "Imprimir", className = "btn-ghost btn-sm" }: { label?: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      <Icon name="print" className="h-4 w-4" />
      {label}
    </button>
  );
}
