"use client";

import { useEffect, useState } from "react";

/**
 * La cuenta con funciones limitadas en el telefono: sin aplicacion instalada y
 * sin uso sin senal.
 *
 * Va en el panel solo cuando la cuenta tiene las funciones limitadas. Quita lo
 * que haya quedado de antes (el trabajador de fondo y las pantallas guardadas),
 * para que nada se abra sin senal. Lo que estaba en la cola esperando senal no
 * se toca: se sube igual.
 *
 * Si se abre desde la aplicacion instalada, la tapa con el aviso: desde el
 * navegador se sigue usando. Los textos no hablan de cobros.
 */
export function SinPlanCompleto({ enlace }: { enlace: string }) {
  const [instalada, setInstalada] = useState(false);
  const [sitio, setSitio] = useState("");

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setInstalada(window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true);
    setSitio(location.host);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((rs) => Promise.all(rs.map((r) => r.unregister())))
        .catch(() => undefined);
    }
    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((ks) => Promise.all(ks.filter((k) => k.startsWith("ten-")).map((k) => caches.delete(k))))
        .catch(() => undefined);
    }
  }, []);

  if (!instalada) return null;

  return (
    <div
      data-app-inactiva
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 text-center shadow-xl">
        <p className="font-display text-lg text-strong">La aplicación instalada no está activa para tu cuenta</p>
        <p className="mt-2 text-sm text-muted">
          Puedes seguir usándola desde el navegador, con internet, en <strong className="text-strong">{sitio}</strong>.
        </p>
        <a href={enlace} target="_blank" rel="noopener noreferrer" className="btn-primary mt-4 inline-flex w-full justify-center">
          Escribir a soporte
        </a>
      </div>
    </div>
  );
}
