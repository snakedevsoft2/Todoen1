"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "../Logo";
import { Icon } from "../Icon";
import { APP_NAME } from "@/lib/brand";

type Chip = { icon: string; label: string; className: string };

type Paso = {
  title: [string, string];
  desc: string;
  extra?: string;
  tilt: string;
  chips: Chip[];
  phone: "resumen" | "operaciones" | "negocios";
};

/**
 * Los tres pasos, con el texto que ya se definio para cada uno.
 *
 * Las tarjetas flotantes son decorativas: representan lo que Todoen1 hace
 * (o los rubros a los que se adapta en el paso 3), nunca un menu de verdad.
 */
const PASOS: Paso[] = [
  {
    title: ["Todo tu negocio.", "En un solo lugar."],
    desc: "Gestiona ventas, clientes, inventario, gastos y mucho más desde tu celular o computador.",
    tilt: "rotateY(-10deg) rotateX(2deg)",
    phone: "resumen",
    chips: [
      { icon: "chart", label: "Ventas", className: "left-[2%] top-[12%] sm:left-[6%]" },
      { icon: "users", label: "Clientes", className: "left-[0%] top-[62%] sm:left-[4%]" },
      { icon: "box", label: "Inventario", className: "right-[2%] top-[8%] sm:right-[6%]" },
      { icon: "wallet", label: "Gastos", className: "right-[0%] top-[58%] sm:right-[4%] hidden sm:flex" },
      { icon: "lock", label: "Caja", className: "right-[10%] bottom-[4%] hidden lg:flex" },
      { icon: "trend", label: "Reportes", className: "left-[12%] bottom-[2%] hidden lg:flex" },
    ],
  },
  {
    title: ["Controla", "tus operaciones."],
    desc: "Registra ventas, administra inventario, controla tus clientes, gastos y caja. Todo de forma sencilla y organizada.",
    tilt: "rotateY(0deg) rotateX(-2deg)",
    phone: "operaciones",
    chips: [
      { icon: "box", label: "Inventario", className: "left-[1%] top-[10%] sm:left-[5%]" },
      { icon: "shirt", label: "Productos", className: "left-[0%] top-[60%] sm:left-[3%]" },
      { icon: "chart", label: "Ventas", className: "right-[1%] top-[14%] sm:right-[5%]" },
      { icon: "users", label: "Clientes", className: "right-[0%] top-[56%] sm:right-[3%] hidden sm:flex" },
      { icon: "trend", label: "Reportes", className: "right-[14%] bottom-[3%] hidden lg:flex" },
    ],
  },
  {
    title: ["Diseñada para", "todos los negocios."],
    desc: "Todoen1 se adapta a tu negocio, sin importar el sector.",
    extra: "Si necesitas una funcionalidad que aún no existe, podemos crearla para ti.\n\nTu negocio es único. Tu sistema también puede serlo.",
    tilt: "rotateY(10deg) rotateX(2deg)",
    phone: "negocios",
    chips: [
      { icon: "receipt", label: "Restaurantes", className: "left-[1%] top-[8%] sm:left-[5%]" },
      { icon: "wallet", label: "Comidas rápidas", className: "right-[0%] top-[10%] sm:right-[4%]" },
      { icon: "scissors", label: "Barberías", className: "right-[2%] top-[38%] hidden sm:flex" },
      { icon: "shirt", label: "Tiendas de ropa", className: "left-[0%] top-[40%] sm:left-[2%]" },
      { icon: "box", label: "Tiendas", className: "left-[6%] bottom-[16%] hidden lg:flex" },
      { icon: "cog", label: "Talleres", className: "left-[0%] bottom-[2%] sm:left-[4%]" },
      { icon: "handshake", label: "Servicios", className: "right-[6%] bottom-[16%] hidden lg:flex" },
      { icon: "user", label: "Profesionales", className: "right-[0%] bottom-[2%] sm:right-[4%]" },
      { icon: "truck", label: "Industria", className: "right-[14%] top-[62%] hidden lg:flex" },
      { icon: "sparkle", label: "Y más", className: "left-[16%] top-[64%] hidden lg:flex" },
    ],
  },
];

/** Recreacion muy simplificada del resumen del panel: saludo + stats. */
function TelefonoResumen() {
  return (
    <div className="flex h-full flex-col gap-2.5 p-3.5">
      <p className="text-[11px] text-white/50">¡Hola, Carlos!</p>
      <p className="text-sm font-semibold text-white">Tu negocio en crecimiento</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["Ventas hoy", "$1.850.000"],
          ["Clientes", "18"],
          ["Productos", "240"],
          ["Utilidad", "$620.000"],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <p className="truncate text-[10px] text-white/45">{label}</p>
            <p className="mt-1 truncate text-[12px] font-bold text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-1 flex-1 rounded-xl border border-white/10 bg-white/5 p-2.5">
        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-white/40">Acciones rápidas</p>
        <div className="grid grid-cols-3 gap-1.5">
          {["Nueva venta", "Clientes", "Producto"].map((a) => (
            <div key={a} className="rounded-lg bg-blue-500/15 px-1.5 py-2 text-center text-[9px] text-blue-200">
              {a}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Recreacion muy simplificada del inventario/ventas. */
function TelefonoOperaciones() {
  const filas: [string, string, "ok" | "bajo" | "sin"][] = [
    ["Camiseta básica", "Stock 12", "ok"],
    ["Pantalón jean", "Stock 5", "bajo"],
    ["Gorra", "Stock 0", "sin"],
  ];
  return (
    <div className="flex h-full flex-col gap-2.5 p-3.5">
      <p className="text-sm font-semibold text-white">Inventario</p>
      <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] text-white/40">
        Buscar producto…
      </div>
      <div className="space-y-1.5">
        {filas.map(([nombre, stock, estado]) => (
          <div
            key={nombre}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-2"
          >
            <div>
              <p className="text-[11px] font-semibold text-white">{nombre}</p>
              <p className="text-[10px] text-white/40">{stock}</p>
            </div>
            <span
              className={
                "rounded-md px-1.5 py-0.5 text-[9px] font-semibold " +
                (estado === "ok"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : estado === "bajo"
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-rose-500/20 text-rose-300")
              }
            >
              {estado === "ok" ? "Normal" : estado === "bajo" ? "Bajo stock" : "Sin stock"}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        tabIndex={-1}
        className="mt-auto rounded-lg bg-blue-500 py-2 text-center text-[11px] font-semibold text-white"
      >
        + Agregar producto
      </button>
    </div>
  );
}

/** Pantalla 3: la marca sola, las tarjetas de rubros hablan por si solas. */
function TelefonoNegocios() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-3.5 text-center">
      <Logo className="h-14 w-14" />
      <p className="text-lg font-bold text-white">{APP_NAME}</p>
      <p className="text-[11px] text-white/50">Tu negocio, sin límites.</p>
    </div>
  );
}

const FONDOS_TELEFONO = { resumen: TelefonoResumen, operaciones: TelefonoOperaciones, negocios: TelefonoNegocios };

const UMBRAL_SWIPE = 60;

export function OnboardingCarousel({ onFinish }: { onFinish: () => void }) {
  const [paso, setPaso] = useState(0);
  const [dragX, setDragX] = useState(0);
  const arrastre = useRef<{ x: number } | null>(null);
  const reducido = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  function ir(n: number) {
    setPaso(Math.max(0, Math.min(PASOS.length - 1, n)));
  }

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        if (paso === PASOS.length - 1) onFinish();
        else ir(paso + 1);
      } else if (e.key === "ArrowLeft") {
        ir(paso - 1);
      } else if (e.key === "Home") {
        ir(0);
      } else if (e.key === "End") {
        ir(PASOS.length - 1);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso]);

  const ultimo = paso === PASOS.length - 1;

  return (
    <div className="onboarding-page relative flex h-dvh flex-col overflow-hidden">
      {/* Luces de fondo: puramente decorativas, no reciben toques. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="onboarding-glow h-[50vh] w-[50vh] -left-[15%] -top-[10%]" />
        <span className="onboarding-glow h-[40vh] w-[40vh] -right-[10%] top-[35%]" style={{ animationDelay: "-6s" }} />
        <span className="onboarding-glow h-[35vh] w-[35vh] left-[20%] bottom-[-15%]" style={{ animationDelay: "-11s" }} />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-8">
        <div className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="text-[15px] font-bold tracking-tight text-white">
            {APP_NAME.slice(0, -1)}
            <span className="text-blue-400">{APP_NAME.slice(-1)}</span>
          </span>
        </div>
        <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/60">
          {paso + 1} / {PASOS.length}
        </span>
      </header>

      <div
        className="relative z-10 flex-1 touch-pan-y select-none overflow-hidden"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          arrastre.current = { x: e.clientX };
        }}
        onPointerMove={(e) => {
          if (!arrastre.current) return;
          setDragX(e.clientX - arrastre.current.x);
        }}
        onPointerUp={() => {
          if (dragX < -UMBRAL_SWIPE) ir(paso + 1);
          else if (dragX > UMBRAL_SWIPE) ir(paso - 1);
          arrastre.current = null;
          setDragX(0);
        }}
        onPointerCancel={() => {
          arrastre.current = null;
          setDragX(0);
        }}
      >
        <div
          className="flex h-full"
          style={{
            transform: "translateX(calc(" + -paso * 100 + "% + " + dragX + "px))",
            transition: arrastre.current || reducido ? "none" : "transform 500ms var(--ease-suave)",
          }}
        >
          {PASOS.map((p, i) => {
            const TelefonoContenido = FONDOS_TELEFONO[p.phone];
            const activo = i === paso;
            return (
              <div key={i} className="flex h-full w-full shrink-0 flex-col items-center px-5 sm:px-8" aria-hidden={!activo}>
                <div className="mt-2 max-w-md text-center">
                  <h1 className="font-display text-[26px] leading-[1.15] text-white sm:text-[32px]">
                    {p.title[0]}
                    <br />
                    <span className="text-blue-400">{p.title[1]}</span>
                  </h1>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-white/60 sm:text-sm">{p.desc}</p>
                  {p.extra && (
                    <p className="mt-2 whitespace-pre-line text-[12px] leading-relaxed text-white/45">{p.extra}</p>
                  )}
                </div>

                <div
                  className="relative mt-4 flex w-full flex-1 items-center justify-center"
                  style={{ perspective: "1400px" }}
                >
                  {p.chips.map((chip, ci) => (
                    <span
                      key={chip.label}
                      className={
                        "onboarding-chip absolute z-10 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[10px] font-semibold text-white/80 sm:text-[11px] " +
                        chip.className
                      }
                      style={{ animationDelay: activo ? ci * 70 + "ms, " + ci * 0.4 + "s" : undefined }}
                    >
                      <Icon name={chip.icon} className="h-3.5 w-3.5 text-blue-300" />
                      {chip.label}
                    </span>
                  ))}

                  <div
                    className="onboarding-phone relative h-[300px] w-[152px] overflow-hidden rounded-[2rem] sm:h-[360px] sm:w-[182px]"
                    style={{
                      transform:
                        "perspective(1400px) " +
                        p.tilt +
                        (activo && arrastre.current ? " rotateY(" + dragX * 0.03 + "deg)" : ""),
                    }}
                  >
                    <div className="absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-black/60" />
                    <TelefonoContenido />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <footer className="relative z-10 flex flex-col items-center gap-4 px-5 pb-6 sm:pb-8">
        <div role="tablist" aria-label="Pantallas" className="flex items-center gap-1.5">
          {PASOS.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === paso}
              aria-current={i === paso ? "step" : undefined}
              aria-label={"Ir a la pantalla " + (i + 1)}
              onClick={() => ir(i)}
              className={
                "onboarding-dot h-2 rounded-full " + (i === paso ? "w-6 bg-blue-400" : "w-2 bg-white/25")
              }
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => (ultimo ? onFinish() : ir(paso + 1))}
          className="w-full max-w-xs rounded-full bg-blue-500 py-3.5 text-center text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(59,130,246,0.6)] transition active:scale-[0.97] sm:w-auto sm:px-10"
        >
          {ultimo ? "Comenzar →" : "Siguiente →"}
        </button>
      </footer>
    </div>
  );
}
