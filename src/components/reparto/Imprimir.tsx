"use client";

import { Icon } from "../Icon";

/** Imprimir la pagina o guardarla como PDF desde el dialogo del navegador. */
export function ImprimirPagina() {
  return (
    <button type="button" className="btn-ghost btn-sm print:hidden" onClick={() => window.print()}>
      <Icon name="print" className="h-4 w-4" />
      Imprimir / PDF
    </button>
  );
}
