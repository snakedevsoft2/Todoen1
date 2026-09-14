"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Vuelve a pedir la pagina cada tantos segundos, para ver al equipo moverse
 * sin tocar nada. Solo con la pantalla a la vista y con red.
 */
export function RefrescoAutomatico({ segundos }: { segundos: number }) {
  const router = useRouter();
  useEffect(() => {
    const reloj = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    }, segundos * 1000);
    return () => clearInterval(reloj);
  }, [router, segundos]);
  return null;
}
