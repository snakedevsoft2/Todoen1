"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";

/**
 * Mandar el enlace de firma: por WhatsApp, por correo, copiandolo o con el
 * menu de compartir del celular. Tambien abrirlo en este mismo telefono, para
 * que el cliente firme ahi mismo con el dedo.
 */
export function CompartirFirma({
  enlace,
  mensaje,
  asunto,
  whatsapp,
  correo,
  firmarAqui = true,
}: {
  enlace: string;
  mensaje: string;
  asunto: string;
  /** El chat del cliente con el mensaje ya escrito. Sin telefono, WhatsApp deja elegir a quien. */
  whatsapp: string;
  correo: string | null;
  firmarAqui?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  // Se mira despues de pintar: en el servidor no hay navigator y la pantalla no coincidiria.
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  useEffect(() => setPuedeCompartir(typeof navigator.share === "function"), []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
    } catch {
      window.prompt("Copia este enlace:", enlace);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function compartir() {
    try {
      await navigator.share({ title: asunto, text: mensaje });
    } catch {
      // La persona cerro el menu: no es un error.
    }
  }

  const mailto =
    "mailto:" + encodeURIComponent(correo ?? "") + "?subject=" + encodeURIComponent(asunto) + "&body=" + encodeURIComponent(mensaje);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <Icon name="link" className="h-4 w-4 shrink-0 text-subtle" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-body" data-enlace-firma>
          {enlace}
        </span>
        <button type="button" onClick={copiar} className="btn-ghost btn-sm shrink-0">
          <Icon name={copiado ? "check" : "link"} className="h-4 w-4" /> {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-success btn-sm">
          <Icon name="whatsapp" className="h-4 w-4" /> WhatsApp
        </a>
        <a href={mailto} className="btn-ghost btn-sm">
          <Icon name="receipt" className="h-4 w-4" /> Correo
        </a>
        {puedeCompartir && (
          <button type="button" onClick={compartir} className="btn-ghost btn-sm">
            <Icon name="upload" className="h-4 w-4" /> Compartir
          </button>
        )}
        {firmarAqui && (
          <a href={enlace} target="_blank" rel="noopener noreferrer" className="btn-soft btn-sm">
            <Icon name="pencil" className="h-4 w-4" /> Firmar en este celular
          </a>
        )}
      </div>
    </div>
  );
}
