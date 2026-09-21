"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Visor para girar un producto con el dedo o el mouse.
 *
 * Recibe las vistas en orden (frente, derecha, atras, izquierda) y cambia de
 * una a otra segun cuanto se arrastra. Cada vista ocupa la misma cantidad de
 * pixeles de arrastre, y da la vuelta completa.
 */
export function Visor360({ nombre, fotos, onCerrar }: { nombre: string; fotos: string[]; onCerrar: () => void }) {
  const [i, setI] = useState(0);
  const arrastre = useRef<{ x: number; desde: number } | null>(null);
  const PASO = 70; // pixeles de arrastre por vista

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "ArrowLeft") setI((n) => (n + 1) % fotos.length);
      if (e.key === "ArrowRight") setI((n) => (n - 1 + fotos.length) % fotos.length);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [fotos.length, onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      role="dialog"
      aria-label={"Vista 360 de " + nombre}
      onClick={onCerrar}
    >
      <div className="w-full max-w-md rounded-2xl bg-panel p-3 shadow-soft-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <p className="truncate font-display text-sm text-strong">{nombre}</p>
          <button type="button" className="btn-ghost btn-sm" onClick={onCerrar} aria-label="Cerrar">
            Cerrar
          </button>
        </div>

        <div
          className="relative aspect-[4/5] w-full cursor-grab touch-pan-y select-none overflow-hidden rounded-xl border border-line bg-white active:cursor-grabbing"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            arrastre.current = { x: e.clientX, desde: i };
          }}
          onPointerMove={(e) => {
            if (!arrastre.current) return;
            const pasos = Math.trunc((e.clientX - arrastre.current.x) / PASO);
            setI((((arrastre.current.desde - pasos) % fotos.length) + fotos.length) % fotos.length);
          }}
          onPointerUp={() => (arrastre.current = null)}
          onPointerCancel={() => (arrastre.current = null)}
        >
          {fotos.map((src, n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={n === i ? nombre : ""}
              draggable={false}
              className={"absolute inset-0 h-full w-full object-contain " + (n === i ? "" : "invisible")}
            />
          ))}
        </div>

        <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
          {fotos.map((_, n) => (
            <span key={n} className={"h-1.5 rounded-full " + (n === i ? "w-4 bg-brand-600" : "w-1.5 bg-line")} />
          ))}
        </div>
        <p className="mt-1.5 text-center text-[11px] text-subtle">
          Arrastra para girarlo. Las vistas a los lados y por atrás son una recreación hecha con IA.
        </p>
      </div>
    </div>
  );
}
