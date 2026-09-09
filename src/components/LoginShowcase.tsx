"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * Panel vivo del ingreso.
 *
 * Va rotando entre los cuatro negocios para que quien llega entienda de una
 * para que sirve la aplicacion, sin tener que leer un parrafo. Si la persona
 * pidio menos animacion en su sistema, se queda quieto en el primero.
 */
const NEGOCIOS = [
  {
    label: "Barberia",
    icon: "scissors",
    color: "#4f46e5",
    titular: "Tus clientes separan el turno solos",
    stat: "12 turnos hoy",
    detalle: "9 atendidos - $ 340.000",
    puntos: ["Agenda por barbero", "Enlace propio de reservas", "Aviso por WhatsApp"],
  },
  {
    label: "Restaurante",
    icon: "table",
    color: "#b91c1c",
    titular: "Una cuenta por cada mesa",
    stat: "6 mesas abiertas",
    detalle: "Sin cobrar $ 285.000",
    puntos: ["Cuentas por mesa", "Cierra y se vuelve venta", "Cierre de caja del dia"],
  },
  {
    label: "Comidas rapidas",
    icon: "receipt",
    color: "#ea580c",
    titular: "Cobra en dos toques",
    stat: "$ 780.000 hoy",
    detalle: "38 ventas - ticket $ 20.500",
    puntos: ["Venta al mostrador", "Gastos del dia", "Cuanto te queda limpio"],
  },
  {
    label: "Tienda de ropa",
    icon: "shirt",
    color: "#0f766e",
    titular: "Tu ropa contada por talla",
    stat: "146 prendas",
    detalle: "3 tallas por acabarse",
    puntos: ["Inventario por talla y color", "Escanea el codigo de barras", "Catalogo con fotos"],
  },
];

export function LoginShowcase() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (quieto) return;
    const timer = setInterval(() => setI((v) => (v + 1) % NEGOCIOS.length), 4200);
    return () => clearInterval(timer);
  }, []);

  const n = NEGOCIOS[i];

  return (
    <div className="flex h-full flex-col justify-center gap-8 p-8 xl:p-10">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-600">
          Todo en uno
        </p>
        <h2 className="mt-3 max-w-md font-display text-[34px] leading-[1.05] tracking-tight text-strong xl:text-[42px]">
          Ventas, inventario y caja de tu negocio.
        </h2>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
          Un negocio, un usuario, datos separados. Lo tuyo no lo ve nadie mas.
        </p>
      </div>

      {/* Tarjeta que va cambiando de negocio */}
      <div
        key={i}
        className="animate-rise rounded-2xl border-2 border-edge bg-panel p-5 shadow-block-lg"
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

      <div className="flex items-center gap-2">
        {NEGOCIOS.map((negocio, index) => (
          <button
            key={negocio.label}
            type="button"
            onClick={() => setI(index)}
            aria-label={negocio.label}
            className={
              "h-2 rounded-full transition-all " +
              (index === i ? "w-8" : "w-2 bg-line-strong hover:bg-muted")
            }
            style={index === i ? { backgroundColor: negocio.color } : undefined}
          />
        ))}
      </div>
    </div>
  );
}
