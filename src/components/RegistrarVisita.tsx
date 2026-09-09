"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { registrarVisitaAction } from "@/actions/telemetria";

/**
 * Anota que apartado se esta viendo.
 *
 * Sirve para poder sugerirle a la persona que apague lo que nunca abre. Se
 * hace desde el navegador porque el layout del servidor no sabe en que
 * direccion esta, y no se guarda nada mas: ni cuanto tiempo, ni que toco.
 *
 * Solo manda una vez por direccion mientras dure la pestana, y del lado del
 * servidor ademas se guarda una sola fila por dia. Un dato que no se usa no
 * justifica ni una consulta de mas.
 */
export function RegistrarVisita({ rutas }: { rutas: Record<string, string> }) {
  const pathname = usePathname();
  const enviadas = useRef<Set<string>>(new Set());

  useEffect(() => {
    const key = rutas[pathname];
    if (!key || enviadas.current.has(key)) return;
    enviadas.current.add(key);
    // Si falla, se pierde una anotacion y ya. No se le dice nada a nadie.
    void registrarVisitaAction(key).catch(() => {});
  }, [pathname, rutas]);

  return null;
}
