"use client";

import { marcarListoAction } from "@/actions/lavadero";
import { FormSinSenal, useCambiosPendientes } from "./SinSenal";
import { SubmitButton } from "./SubmitButton";
import { Icon } from "./Icon";

/**
 * El "Ya terminé" del lavador en Mis lavados. Si lo toco sin senal, queda en
 * la cola del telefono y aqui se dice que ya quedo, en vez de seguir
 * mostrando el boton como si no hubiera pasado nada.
 */
export function YaTermine({ washJobId, vehiculo }: { washJobId: string; vehiculo: string }) {
  const cambios = useCambiosPendientes();
  const hecho = cambios.some(
    (c) => c.accion === "marcarListoAction" && c.campos.some(([k, v]) => k === "washJobId" && v === washJobId)
  );

  if (hecho) {
    return (
      <p data-sin-subir className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-warn">
        <Icon name="clock" className="h-3.5 w-3.5" />
        Ya terminaste: se avisa al patio cuando vuelva la señal.
      </p>
    );
  }

  return (
    <FormSinSenal accion="marcarListoAction" servidor={marcarListoAction} className="mt-2">
      <input type="hidden" name="washJobId" value={washJobId} />
      {/* Solo para el aviso de lo que espera senal: el servidor no lo lee. */}
      <input type="hidden" name="clientName" value={vehiculo} />
      <SubmitButton className="btn-primary btn-sm" pendingText="...">
        Ya terminé
      </SubmitButton>
    </FormSinSenal>
  );
}
