"use client";

import { useEffect, useState } from "react";
import { OnboardingCarousel } from "./OnboardingCarousel";

const CLAVE = "todoen1_onboarding_seen";

/**
 * Capa previa al login, solo para quien no la haya visto.
 *
 * El login (src/app/login/page.tsx) sigue siendo un componente de servidor
 * que ya redirige a quien tiene sesion; esto solo envuelve lo que ese
 * servidor ya renderizo, sin tocar el formulario ni la logica de entrar.
 *
 * `mostrar` arranca en null (todavia no se sabe) para no parpadear: en el
 * primer render, tanto en el servidor como en el cliente antes del efecto,
 * nadie ve ni el onboarding ni el login - solo el fondo oscuro, un instante.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [mostrar, setMostrar] = useState<boolean | null>(null);

  useEffect(() => {
    let visto = false;
    try {
      visto = localStorage.getItem(CLAVE) === "true";
    } catch {
      // Sin almacenamiento (modo privado, bloqueado): mejor mostrar de mas
      // que tumbar la pagina.
    }
    setMostrar(!visto);
  }, []);

  if (mostrar === null) return <div className="min-h-dvh bg-[#05070f]" />;
  if (!mostrar) return <>{children}</>;

  return (
    <OnboardingCarousel
      onFinish={() => {
        try {
          localStorage.setItem(CLAVE, "true");
        } catch {
          // Si no se pudo guardar, la proxima vez vuelve a aparecer: no es
          // grave, es justo lo que pasaria sin este intento.
        }
        setMostrar(false);
      }}
    />
  );
}
