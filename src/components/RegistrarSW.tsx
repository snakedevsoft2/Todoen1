"use client";

import { useEffect, useRef } from "react";

/**
 * Registra el trabajador de fondo (public/sw.js).
 *
 * Con `guardarEstaPagina`, ademas le pide guardar la pagina actual y los
 * archivos que acaba de cargar, para poder abrirla en frio sin red. Se pide
 * solo con red: sin ella no hay nada nuevo que guardar.
 *
 * Con `precargar`, antes de pedirlo carga lo que la pantalla solo baja al
 * usarlo (el armador de PDF, el lector de texto) y devuelve archivos extra que
 * tambien hay que guardar. Sin esto, la primera vez que se tocara "Pasar a
 * texto" sin senal no habria con que.
 *
 * No corre en desarrollo: el trabajador de fondo guardaria archivos que el
 * servidor de desarrollo cambia a cada rato, y la pantalla quedaria mostrando
 * versiones viejas sin explicacion.
 */
export function RegistrarSW({
  guardarEstaPagina = false,
  precargar,
}: {
  guardarEstaPagina?: boolean;
  precargar?: () => Promise<string[]>;
}) {
  // En una referencia: una funcion nueva en cada render no debe volver a
  // registrar ni a guardar todo.
  const precarga = useRef(precargar);
  precarga.current = precargar;

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let vivo = true;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(async (reg) => {
        if (!vivo || !guardarEstaPagina || !navigator.onLine) return;
        let extras: string[] = [];
        try {
          extras = (await precarga.current?.()) ?? [];
        } catch {
          // Si la precarga falla, se guarda igual lo demas.
        }
        if (!vivo) return;
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
        reg.active?.postMessage({ tipo: "guardar", pagina: location.pathname, recursos: [...recursos, ...extras] });
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
