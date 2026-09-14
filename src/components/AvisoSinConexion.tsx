"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Estas pantallas ya dicen, a su manera, que estan sin senal. */
const CON_AVISO_PROPIO = ["/panel/marcar", "/panel/ventas", "/panel/escaner", "/panel/informes", "/panel/novedades"];

/**
 * Sin senal, se dice arriba de la pantalla que lo que se ve es lo ultimo que
 * quedo guardado: sin esto, alguien podria creer que una lista vieja es la de
 * este momento.
 */
export function AvisoSinConexion() {
  const ruta = usePathname();
  const [sinRed, setSinRed] = useState(false);

  useEffect(() => {
    const revisar = () => setSinRed(!navigator.onLine);
    revisar();
    window.addEventListener("online", revisar);
    window.addEventListener("offline", revisar);
    return () => {
      window.removeEventListener("online", revisar);
      window.removeEventListener("offline", revisar);
    };
  }, []);

  if (!sinRed || CON_AVISO_PROPIO.includes(ruta)) return null;
  return (
    <p data-aviso-sin-conexion className="mb-3 rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-[13px] text-warn">
      Sin conexión: estás viendo lo último que se guardó en este teléfono. Puedes consultar, descargar e imprimir; lo que
      necesite internet te lo va a avisar.
    </p>
  );
}
