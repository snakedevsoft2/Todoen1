"use client";

import { useEffect } from "react";

/**
 * Registra el trabajador de fondo (public/sw.js).
 *
 * Con `guardarEstaPagina`, ademas le pide guardar la pagina actual y los
 * archivos que acaba de cargar, para poder abrirla en frio sin red. Se pide
 * solo con red: sin ella no hay nada nuevo que guardar.
 *
 * No corre en desarrollo: el trabajador de fondo guardaria archivos que el
 * servidor de desarrollo cambia a cada rato, y la pantalla quedaria mostrando
 * versiones viejas sin explicacion.
 */
export function RegistrarSW({ guardarEstaPagina = false }: { guardarEstaPagina?: boolean }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let vivo = true;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (!vivo || !guardarEstaPagina || !navigator.onLine) return;
        const origen = location.origin;
        const recursos = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((n) => {
            try {
              const u = new URL(n);
              return u.origin === origen && u.pathname.startsWith("/_next/static/");
            } catch {
              return false;
            }
          });
        reg.active?.postMessage({ tipo: "guardar", pagina: location.pathname, recursos });
      })
      .catch(() => {
        // Sin trabajador de fondo la aplicacion funciona igual, solo que no
        // abre en frio sin red.
      });

    return () => {
      vivo = false;
    };
  }, [guardarEstaPagina]);

  return null;
}
