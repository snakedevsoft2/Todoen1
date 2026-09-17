"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "./Icon";

const CLAVE = "ten_oferta_mes";

/** "2026-09", para que la oferta vuelva a salir en un mes nuevo. */
function mesActual(): string {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

/**
 * Pop-up de bienvenida en la pagina publica: si el negocio se registra este
 * mes, se lleva de regalo su pagina o landing page basica.
 *
 * Se muestra una vez por mes por navegador (guardado en localStorage). Cerrar
 * cuenta como visto para todo ese mes; el mes siguiente vuelve a salir.
 */
export function OfertaDelMes() {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE) !== mesActual()) setAbierto(true);
    } catch {
      setAbierto(true);
    }
  }, []);

  function cerrar() {
    try {
      localStorage.setItem(CLAVE, mesActual());
    } catch {
      // Sin almacenamiento, vuelve a salir en la siguiente visita.
    }
    setAbierto(false);
  }

  if (!abierto) return null;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/50" aria-hidden="true" onClick={cerrar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Oferta del mes"
        data-oferta-mes
        className="fixed inset-x-3 top-1/2 z-[85] max-h-[85vh] -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-panel p-6 text-center shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-[420px] sm:-translate-x-1/2"
      >
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar"
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted transition-colors hover:bg-surface hover:text-strong"
        >
          <Icon name="x" className="h-5 w-5" />
        </button>

        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon name="sparkle" className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-display text-xl text-strong">Regalo de este mes</h2>
        <p className="mt-2 text-sm leading-relaxed text-body">
          Si adquieres tu app <strong>este mes</strong>, te obsequiamos tu página o landing page básica para tu
          negocio. Empiezas de una con el kit ideal para atraer clientes.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <Link href="/registro" onClick={cerrar} className="btn-primary">
            <Icon name="sparkle" className="h-4 w-4" />
            Quiero mi kit
          </Link>
          <button type="button" onClick={cerrar} className="btn-ghost">
            Ahora no
          </button>
        </div>
      </div>
    </>
  );
}
