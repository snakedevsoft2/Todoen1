"use client";

import { useState } from "react";
import { ticketFileName, ticketMensaje, ticketTirilla, type TicketData } from "@/lib/ticket-parqueadero";
import { numeroTicket } from "@/lib/parqueadero-tarifa";
import { BotonImprimir } from "../BotonImprimir";
import { Icon } from "../Icon";

/**
 * Imprimir el ticket o mandarlo por WhatsApp o por correo.
 *
 * WhatsApp abre el chat con el cliente si se anoto su telefono; si no, abre
 * WhatsApp para elegir a quien mandarselo. El mensaje lleva el enlace del QR,
 * que es lo que el cliente necesita para ver cuanto lleva.
 */
export function TicketAcciones({
  data,
  waNumero,
  email,
}: {
  data: TicketData;
  /** El telefono del cliente ya con indicativo, o null. */
  waNumero: string | null;
  email: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  const mensaje = ticketMensaje(data);
  const asunto = "Ticket " + numeroTicket(data.seq) + " - " + data.businessName;
  const wa = "https://wa.me/" + (waNumero ?? "") + "?text=" + encodeURIComponent(mensaje);
  const correo =
    "mailto:" + encodeURIComponent(email ?? "") + "?subject=" + encodeURIComponent(asunto) + "&body=" + encodeURIComponent(mensaje);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(data.url);
    } catch {
      window.prompt("Copia este enlace:", data.url);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-acciones-ticket>
      <BotonImprimir
        tirilla={() => ticketTirilla(data)}
        logoUrl={data.logoUrl}
        nombreArchivo={ticketFileName(data)}
        label="Imprimir ticket"
        className="btn-primary btn-sm"
        menu="izquierda"
      />
      <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-success btn-sm">
        <Icon name="whatsapp" className="h-4 w-4" />
        {waNumero ? "Enviar por WhatsApp" : "WhatsApp"}
      </a>
      <a href={correo} className="btn-ghost btn-sm">
        <Icon name="link" className="h-4 w-4" />
        {email ? "Enviar por correo" : "Correo"}
      </a>
      <button type="button" onClick={copiar} className="btn-ghost btn-sm">
        <Icon name={copiado ? "check" : "link"} className="h-4 w-4" />
        {copiado ? "Copiado" : "Copiar enlace"}
      </button>
    </div>
  );
}
