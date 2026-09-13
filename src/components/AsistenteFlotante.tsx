"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { APP_LOGO_ICON } from "@/lib/brand";
import { AssistantChat } from "./AssistantChat";
import { Icon } from "./Icon";

const CLAVE_AVISO = "ten_snake_aviso_cerrado";

/**
 * La IA Snake siempre a la mano: un boton flotante con el logo y un aviso de
 * "Habla con nuestra IA Snake".
 *
 * El aviso se puede cerrar y no vuelve a salir en ese navegador; el boton se
 * queda. En la pantalla del asistente no aparece, porque ahi ya esta el chat.
 */
export function AsistenteFlotante({ sugerencias }: { sugerencias: string[] }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState(false);

  useEffect(() => {
    try {
      setAviso(localStorage.getItem(CLAVE_AVISO) !== "1");
    } catch {
      setAviso(true);
    }
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const alEscape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", alEscape);
    return () => window.removeEventListener("keydown", alEscape);
  }, [abierto]);

  if (pathname.startsWith("/panel/asistente")) return null;

  function cerrarAviso() {
    setAviso(false);
    try {
      localStorage.setItem(CLAVE_AVISO, "1");
    } catch {
      // Sin almacenamiento el aviso vuelve a salir; no es grave.
    }
  }

  return (
    <div data-snake>
      {abierto && (
        <section
          role="dialog"
          aria-label="IA Snake"
          className="fixed inset-x-3 bottom-3 top-16 z-[60] flex flex-col overflow-hidden rounded-3xl border border-line bg-panel shadow-card-hover sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[600px] sm:w-[400px]"
        >
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <img src={APP_LOGO_ICON} alt="" className="h-9 w-9 rounded-xl object-cover shadow-card" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-strong">IA Snake</p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden />
                Tu asistente · pregúntale por tu negocio
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-strong"
              aria-label="Cerrar la IA Snake"
            >
              <Icon name="x" className="h-5 w-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 p-3">
            <AssistantChat sugerencias={sugerencias} listo alto="h-full" />
          </div>
        </section>
      )}

      <div className="fixed bottom-20 right-4 z-[55] flex items-center gap-2 sm:bottom-6 sm:right-6">
        {aviso && !abierto && (
          <div
            data-snake-aviso
            className="relative flex items-center gap-2 rounded-2xl border border-line bg-panel py-2 pl-3 pr-1.5 shadow-card-hover"
          >
            <button type="button" onClick={() => setAbierto(true)} className="text-left">
              <span className="block text-[13px] font-bold leading-tight text-strong">Habla con nuestra IA Snake</span>
              <span className="block text-[11px] leading-tight text-muted">Te responde al instante</span>
            </button>
            <button
              type="button"
              onClick={cerrarAviso}
              className="rounded-full p-1 text-subtle transition-colors hover:bg-surface hover:text-strong"
              aria-label="Ocultar aviso"
            >
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
            <span
              aria-hidden
              className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-line bg-panel"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          aria-expanded={abierto}
          aria-label={abierto ? "Cerrar la IA Snake" : "Habla con nuestra IA Snake"}
          className="group relative h-14 w-14 shrink-0 rounded-2xl shadow-card-hover transition-transform duration-200 ease-resorte hover:scale-105 active:scale-95"
        >
          <img src={APP_LOGO_ICON} alt="" className="h-full w-full rounded-2xl object-cover" />
          {!abierto && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
              <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-panel bg-good" />
            </span>
          )}
          {abierto && (
            <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/45 text-white">
              <Icon name="x" className="h-6 w-6" />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
