"use client";

import { useEffect, useState } from "react";
import { APP_NAME, APP_TAGLINE, NEGOCIOS } from "@/lib/brand";
import { Icon } from "./Icon";

/**
 * Panel de bienvenida del ingreso.
 *
 * Va rotando entre los cuatro negocios para que quien llega entienda de una
 * si la aplicacion es para el, sin tener que leer un parrafo. Los cuatro
 * aparecen siempre como items: el que esta sonando se resalta, pero los otros
 * tres se siguen viendo, que es justo lo que hay que demostrar.
 *
 * Si la persona pidio menos animacion en su sistema, se queda quieto.
 */
export function LoginShowcase({ compact = false }: { compact?: boolean }) {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (quieto) return;
    const timer = setInterval(() => setI((v) => (v + 1) % NEGOCIOS.length), 4200);
    return () => clearInterval(timer);
  }, [auto]);

  const n = NEGOCIOS[i];

  /** Al tocar un negocio dejamos de rotar: la persona esta mirando ese. */
  function elegir(index: number) {
    setI(index);
    setAuto(false);
  }

  return (
    <div className={"flex h-full flex-col justify-center gap-7 " + (compact ? "" : "p-8 xl:p-10")}>
      {!compact && (
        <div className="animate-entrar">
          <p className="font-display text-[38px] leading-none tracking-tight text-strong xl:text-[46px]">
            {APP_NAME.slice(0, -1)}
            <span className="text-brand-600">{APP_NAME.slice(-1)}</span>
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            {APP_TAGLINE}. Un negocio, un usuario, datos separados: lo tuyo no lo ve nadie mas.
          </p>
        </div>
      )}

      {/* Los cuatro negocios, siempre visibles. El activo se pinta solido. */}
      <div>
        <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
          Sirve para
        </p>
        <div className="flex flex-wrap gap-2">
          {NEGOCIOS.map((negocio, index) => {
            const activo = index === i;
            return (
              <button
                key={negocio.key}
                type="button"
                onClick={() => elegir(index)}
                className={
                  "flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-xs font-bold transition-all duration-200 " +
                  (activo
                    ? "border-edge text-white shadow-block"
                    : "border-edge bg-panel text-body hover:bg-surface")
                }
                style={activo ? { backgroundColor: negocio.color } : undefined}
              >
                <Icon name={negocio.icon} className="h-4 w-4 shrink-0" />
                {negocio.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tarjeta del negocio que esta sonando */}
      <div
        key={i}
        className="animate-rise rounded-2xl border-2 bg-panel p-5 shadow-block-lg"
        style={{ borderColor: n.color }}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-edge text-white"
            style={{ backgroundColor: n.color }}
          >
            <Icon name={n.icon} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
              {n.label}
            </p>
            <p className="truncate font-display text-[15px] leading-tight text-strong">
              {n.titular}
            </p>
          </div>
        </div>

        <div className="mt-4 border-t-2 border-line pt-4">
          <p className="stat-value" style={{ color: n.color }}>
            {n.stat}
          </p>
          <p className="mt-1.5 text-xs font-medium text-muted">{n.detalle}</p>
        </div>

        <ul className="mt-4 space-y-1.5">
          {n.puntos.map((punto) => (
            <li key={punto} className="flex items-center gap-2 text-xs text-body">
              <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-good" />
              {punto}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
