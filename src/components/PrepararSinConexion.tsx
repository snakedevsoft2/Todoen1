"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Cada cuanto se vuelven a guardar todas las pantallas del menu. */
const CADA_MS = 30 * 60_000;

/**
 * Deja la aplicacion lista para usarse sin senal.
 *
 * Con senal, y sin estorbar:
 *   - guarda la pantalla que se esta viendo cada vez que cambia;
 *   - cada media hora, en segundo plano, guarda todas las pantallas del menu
 *     de esta persona con sus archivos, el logo y el armador de PDF.
 * Asi, sin senal se puede abrir cualquier apartado, ver lo ultimo que se
 * cargo, y descargar o imprimir facturas y recibos.
 *
 * El trabajo lo hace public/sw.js. No corre en desarrollo, por la misma razon
 * que RegistrarSW.
 */
export function PrepararSinConexion({
  cuenta,
  paginas,
  archivos,
}: {
  /** La persona: cada una tiene su propio reloj de precarga. */
  cuenta: string;
  /** Las pantallas del menu. */
  paginas: string[];
  /** El logo y la foto de perfil. */
  archivos: string[];
}) {
  const ruta = usePathname();

  // La pantalla que se esta viendo.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let vivo = true;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (!vivo || !navigator.onLine) return;
        const recursos = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((n) => n.startsWith(location.origin + "/_next/static/"));
        reg.active?.postMessage({ tipo: "guardar", pagina: location.pathname + location.search, recursos });
      })
      .catch(() => {
        // Sin trabajador de fondo la aplicacion funciona igual, solo que no sin senal.
      });
    return () => {
      vivo = false;
    };
  }, [ruta]);

  // Todas las del menu, en segundo plano.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const clave = "ten_precarga:" + cuenta;
    const precargar = async () => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      try {
        if (Date.now() - Number(localStorage.getItem(clave) ?? 0) < CADA_MS) return;
        localStorage.setItem(clave, String(Date.now()));
      } catch {
        // Sin almacenamiento se precarga igual, una vez por visita.
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        // Lo que las pantallas solo bajan al usarlo: el armador de PDF de las
        // facturas y los recibos. Al cargarlo pasa por el trabajador de fondo
        // y queda guardado.
        await import("jspdf").catch(() => undefined);
        reg.active?.postMessage({ tipo: "precargar", paginas, recursos: archivos });
      } catch {
        // Se intenta en la proxima visita.
      }
    };
    // Unos segundos despues de abrir, para no competir con la pantalla.
    const reloj = setTimeout(() => void precargar(), 4000);
    return () => clearTimeout(reloj);
    // Una vez por persona: las listas no cambian mientras se navega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta]);

  return null;
}
