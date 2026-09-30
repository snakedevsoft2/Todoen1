"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import { cobroDe, duracionTexto, minutosEntre, type Tarifa } from "@/lib/parqueadero-tarifa";

/** La hora del reloj, que cambia sola. Arranca vacia para que el servidor y el navegador pinten lo mismo. */
function useAhora(cadaMs: number): number | null {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    setAhora(Date.now());
    const reloj = setInterval(() => setAhora(Date.now()), cadaMs);
    return () => clearInterval(reloj);
  }, [cadaMs]);
  return ahora;
}

function reloj(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(seg).padStart(2, "0");
}

/**
 * Tiempo adentro y lo que va debiendo, contando solo en el navegador.
 *
 * La cuenta es la misma de lib/parqueadero-tarifa.ts que usa el servidor al
 * cobrar, asi que lo que se ve aqui es lo que se cobra en la caja.
 */
export function TiempoYCobro({
  enteredAt,
  tarifa,
  currency,
  variante = "fila",
}: {
  enteredAt: string;
  tarifa: Tarifa;
  currency: string;
  variante?: "fila" | "grande";
}) {
  const ahora = useAhora(variante === "grande" ? 1000 : 20000);
  const valor = (t: number) => cobroDe(tarifa, minutosEntre(enteredAt, t));

  if (variante === "grande") {
    const ms = ahora == null ? 0 : ahora - new Date(enteredAt).getTime();
    return (
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="eyebrow">Tiempo adentro</p>
          <p className="mt-2 font-display text-3xl tabular-nums text-strong sm:text-4xl" data-reloj>
            {ahora == null ? "--:--:--" : reloj(ms)}
          </p>
          <p className="mt-1 text-xs text-subtle">
            {ahora == null ? "" : duracionTexto(minutosEntre(enteredAt, ahora))}
          </p>
        </div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="eyebrow">Llevas a pagar</p>
          <p className="mt-2 font-display text-3xl tabular-nums text-brand-700 sm:text-4xl" data-cobro>
            {ahora == null ? "..." : money(valor(ahora), currency)}
          </p>
          <p className="mt-1 text-xs text-subtle">Si sales ahora</p>
        </div>
      </div>
    );
  }

  if (ahora == null) return <span className="text-xs text-subtle">...</span>;
  return (
    <span className="text-xs text-muted">
      {duracionTexto(minutosEntre(enteredAt, ahora))} ·{" "}
      <b className="tabular-nums text-strong">{money(valor(ahora), currency)}</b>
    </span>
  );
}

/** Solo el valor, para el formulario de salida. */
export function CobroEnVivo({ enteredAt, tarifa, currency }: { enteredAt: string; tarifa: Tarifa; currency: string }) {
  const ahora = useAhora(15000);
  if (ahora == null) return <span>...</span>;
  return (
    <span className="tabular-nums">
      {money(cobroDe(tarifa, minutosEntre(enteredAt, ahora)), currency)}
      <span className="ml-1.5 text-xs font-normal text-subtle">({duracionTexto(minutosEntre(enteredAt, ahora))})</span>
    </span>
  );
}
