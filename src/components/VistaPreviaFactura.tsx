"use client";

import { useEffect, useState } from "react";
import { invoiceFileName, invoiceTirilla, numeroDe, type InvoiceData } from "@/lib/invoice";
import { TIRILLA_CSS, tirillaHtml } from "@/lib/tirilla";
import { BotonImprimir } from "./BotonImprimir";
import { Icon } from "./Icon";

/**
 * Los estilos del recibo impreso, pasados a la vista previa: los mismos
 * renglones, el mismo ancho, la misma letra. Solo se toman los del recibo y no
 * los que lo esconden fuera de la pantalla.
 */
const CSS_VISTA = TIRILLA_CSS.split("\n")
  .filter((l) => l.startsWith("#ten-impresion .ti"))
  .map((l) => l.replaceAll("#ten-impresion", ".vista-factura"))
  .join("\n");

/**
 * La factura tal como sale impresa, dentro de la misma pantalla (lo pidio
 * Chopo Snacks, para revisarla antes de imprimir o entregar).
 *
 * El "Ver factura" de siempre abre el PDF en otra pestaña, y en la aplicacion
 * instalada del celular esa pestaña puede salir en blanco. Esto no abre nada:
 * pinta el recibo aqui mismo, y desde ahi se imprime.
 *
 * Va por debajo del menu de imprimir (z 65/70), que en el celular sale desde
 * abajo a lo ancho: si fuera por encima, ese menu quedaria tapado.
 */
export function VistaPreviaFactura({
  data,
  soloBluetooth = false,
}: {
  data: InvoiceData;
  /** El empleado solo imprime por la termica de mostrador, sin dialogo. */
  soloBluetooth?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    const conEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(false);
    };
    window.addEventListener("keydown", conEsc);
    return () => window.removeEventListener("keydown", conEsc);
  }, [abierta]);

  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className="btn-ghost btn-sm">
        <Icon name="eye" className="h-4 w-4" />
        Vista previa
      </button>

      {abierta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={"Factura " + numeroDe(data)}
          data-vista-factura
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAbierta(false);
          }}
        >
          <div className="flex max-h-[92dvh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-panel shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <p className="text-sm font-semibold text-strong">Factura {numeroDe(data)}</p>
              <button
                type="button"
                onClick={() => setAbierta(false)}
                className="btn-ghost btn-sm px-2"
                aria-label="Cerrar vista previa"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-surface p-3">
              <style>{CSS_VISTA}</style>
              <div
                className="vista-factura mx-auto w-fit max-w-full overflow-hidden rounded-md border border-line shadow-sm"
                // Los textos ya vienen escapados (ver tirillaHtml en lib/tirilla.ts).
                dangerouslySetInnerHTML={{ __html: tirillaHtml(invoiceTirilla(data), "80", data.logoUrl) }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
              <BotonImprimir
                tirilla={() => invoiceTirilla(data)}
                logoUrl={data.logoUrl}
                nombreArchivo={invoiceFileName(data)}
                soloBluetooth={soloBluetooth}
                menu="izquierda"
              />
              <button type="button" onClick={() => setAbierta(false)} className="btn-ghost btn-sm ml-auto">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
