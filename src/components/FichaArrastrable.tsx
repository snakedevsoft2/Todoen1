"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Envuelve una casilla de producto para poder moverla arrastrando.
 * En el celular hay que dejar el dedo un momento (para no chocar con el
 * desplazamiento); los toques rapidos siguen agregando el producto.
 */
export function FichaArrastrable({ id, activa, children }: { id: string; activa: boolean; children: ReactNode }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id, disabled: !activa });
  return (
    <div
      ref={setNodeRef}
      {...(activa ? listeners : {})}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
      className={isDragging ? "relative shadow-card" : "relative"}
    >
      {children}
    </div>
  );
}
