"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * Compartir el portafolio del negocio: el codigo QR para mostrarlo o
 * descargarlo, y el enlace para copiarlo o mandarlo por WhatsApp.
 *
 * En el celular sale desde abajo, a lo ancho de la pantalla; en el computador,
 * en el centro. Asi nunca queda cortado por un lado.
 */
export function CompartirPortafolio({ ruta, qr, negocio }: { ruta: string; qr: string; negocio: string }) {
  const [abierto, setAbierto] = useState(false);
  const [enlace, setEnlace] = useState(ruta);
  const [aviso, setAviso] = useState("");
  const [puedeCompartir, setPuedeCompartir] = useState(false);

  useEffect(() => {
    setEnlace(location.origin + ruta);
    setPuedeCompartir(typeof navigator.share === "function");
  }, [ruta]);

  const mensaje = "Mira el portafolio de " + negocio + ": " + enlace;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setAviso("Enlace copiado.");
    } catch {
      setAviso("No se pudo copiar. Mantén presionado el enlace para copiarlo.");
    }
  }

  async function compartir() {
    try {
      await navigator.share({ title: negocio, text: "Mira el portafolio de " + negocio, url: enlace });
    } catch {
      // Cancelar el menu de compartir no es un error.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAviso("");
          setAbierto(true);
        }}
        className="btn-ghost btn-sm w-full justify-start"
      >
        <Icon name="scan" className="h-4 w-4" />
        Compartir con QR
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-[65] bg-black/40" aria-hidden="true" onClick={() => setAbierto(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Compartir mi portafolio"
            data-compartir-portafolio
            className="fixed inset-x-3 bottom-3 z-[70] max-h-[85vh] overflow-y-auto rounded-2xl border border-line bg-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[360px] sm:-translate-x-1/2 sm:-translate-y-1/2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-base text-strong">Compartir mi portafolio</p>
              <button type="button" onClick={() => setAbierto(false)} className="text-[12px] font-semibold text-muted">
                Cerrar
              </button>
            </div>

            <div className="mt-3 flex justify-center rounded-xl border border-line bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={"Código QR de " + negocio} className="h-48 w-48" />
            </div>
            <p className="mt-2 text-center text-[12px] text-muted">Quien lo escanee con la cámara llega directo a tu portafolio.</p>

            <p className="mt-3 break-all rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-body" data-enlace-portafolio>
              {enlace}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={copiar} className="btn-ghost btn-sm justify-center">
                <Icon name="link" className="h-4 w-4" />
                Copiar enlace
              </button>
              <a
                href={"https://wa.me/?text=" + encodeURIComponent(mensaje)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost btn-sm justify-center"
                data-compartir-whatsapp
              >
                <Icon name="whatsapp" className="h-4 w-4" />
                WhatsApp
              </a>
              <a href={qr + "?descargar=1"} className="btn-ghost btn-sm justify-center">
                <Icon name="download" className="h-4 w-4" />
                Descargar QR
              </a>
              {puedeCompartir ? (
                <button type="button" onClick={compartir} className="btn-ghost btn-sm justify-center">
                  <Icon name="upload" className="h-4 w-4" />
                  Compartir
                </button>
              ) : (
                <a href={ruta} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm justify-center">
                  <Icon name="link" className="h-4 w-4" />
                  Abrir
                </a>
              )}
            </div>
            {aviso && (
              <p className="mt-2 text-[12px] text-muted" role="status">
                {aviso}
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}
