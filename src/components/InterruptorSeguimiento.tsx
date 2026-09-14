"use client";

import { useState, useTransition } from "react";
import { seguimientoAction } from "@/actions/ubicacion";

/** El dueño activa o apaga el pedido de ubicación durante la jornada. */
export function InterruptorSeguimiento({ activo }: { activo: boolean }) {
  const [encendido, setEncendido] = useState(activo);
  const [guardando, empezar] = useTransition();

  return (
    <label className="flex items-start gap-2.5 text-sm text-body">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        checked={encendido}
        disabled={guardando}
        data-interruptor-seguimiento
        onChange={(e) => {
          const valor = e.target.checked;
          setEncendido(valor);
          empezar(async () => {
            await seguimientoAction(valor);
          });
        }}
      />
      <span>
        <strong className="text-strong">Pedir la ubicación durante la jornada</strong>
        <span className="block text-[12px] leading-snug text-muted">
          Cada persona tiene que aceptarlo en su teléfono. Solo se envía entre su entrada y su salida, mientras tenga la pantalla de
          Marcar abierta.
        </span>
      </span>
    </label>
  );
}
