"use client";

import { invoiceFileName, invoiceTirilla, type InvoiceData } from "@/lib/invoice";
import { BotonImprimir } from "./BotonImprimir";

/**
 * Boton de imprimir a la vista en cada venta del dia, sin tener que abrir
 * antes el panel de Factura. Vive aparte porque la pagina es del servidor y
 * la funcion que arma el recibo no puede cruzar hacia el cliente.
 */
export function ImprimirVenta({ data, soloBluetooth = false }: { data: InvoiceData; soloBluetooth?: boolean }) {
  return (
    <BotonImprimir
      tirilla={() => invoiceTirilla(data)}
      logoUrl={data.logoUrl}
      nombreArchivo={invoiceFileName(data)}
      soloBluetooth={soloBluetooth}
      menu="izquierda"
    />
  );
}
