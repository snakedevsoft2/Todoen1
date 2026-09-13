"use client";

import { useState } from "react";
import { diagnosticarIaAction } from "@/actions/agente";
import { Icon } from "./Icon";

type Resultado = Awaited<ReturnType<typeof diagnosticarIaAction>>;

/**
 * Prueba la conexion con la IA y dice exactamente que falla.
 *
 * Existe porque cuando la IA no responde, al cliente solo le sale una
 * disculpa, y el dueño no tiene como saber si es la clave, la cuota gratuita o
 * el modelo sin entrar a los registros del servidor.
 */
export function DiagnosticoIa() {
  const [r, setR] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(false);

  const Fila = ({ ok, titulo, detalle }: { ok: boolean; titulo: string; detalle: string }) => (
    <li className="flex items-start gap-2.5">
      <span className={"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full " + (ok ? "bg-good text-white" : "bg-bad text-white")}>
        <Icon name={ok ? "check" : "x"} className="h-3 w-3" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-strong">{titulo}</span>
        <span className="block text-[12px] text-muted [overflow-wrap:anywhere]">{detalle}</span>
      </span>
    </li>
  );

  return (
    <div data-diagnostico-ia>
      <button
        type="button"
        className="btn-ghost btn-sm"
        disabled={cargando}
        onClick={async () => {
          setCargando(true);
          try {
            setR(await diagnosticarIaAction());
          } finally {
            setCargando(false);
          }
        }}
      >
        <Icon name="sparkle" className="h-4 w-4" />
        {cargando ? "Probando…" : "Probar conexión con la IA"}
      </button>

      {r && (
        <ul className="mt-3 space-y-2.5">
          <Fila
            ok={r.clave}
            titulo="Clave de Gemini"
            detalle={r.clave ? "Está puesta en el servidor." : "Falta GEMINI_API_KEY en Vercel."}
          />
          {r.clave && (
            <>
              <Fila ok={r.simple.ok} titulo={"Respuesta simple (modelo " + r.modelo + ")"} detalle={r.simple.detalle} />
              <Fila ok={r.herramientas.ok} titulo="Respuesta con funciones (la que usa el agente)" detalle={r.herramientas.detalle} />
            </>
          )}
        </ul>
      )}
    </div>
  );
}
