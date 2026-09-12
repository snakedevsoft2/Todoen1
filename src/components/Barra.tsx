"use client";

import { useEffect, useState } from "react";

/**
 * Barra de avance.
 *
 * Se llena al aparecer, desde cero. No es adorno: el ojo lee "va por la
 * mitad" mucho antes de leer "7 de 20", y esa lectura de un vistazo es todo lo
 * que se necesita cuando se revisan treinta prestamos seguidos.
 *
 * El numero va siempre al lado. La barra sola no sirve para cobrar.
 */
export function Barra({
  valor,
  total,
  label,
  detalle,
  tono = "brand",
}: {
  valor: number;
  total: number;
  label?: string;
  /** Lo que va a la derecha: "7 de 20", "$390.000 restantes". */
  detalle?: string;
  tono?: "brand" | "good" | "bad" | "warn";
}) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (valor / total) * 100)) : 0;

  // Arranca en cero y sube en el primer pintado: sin esto la barra aparece ya
  // llena y se pierde justo lo que la hace legible.
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setAncho(pct));
    return () => cancelAnimationFrame(t);
  }, [pct]);

  const color = {
    brand: "bg-brand-600",
    good: "bg-good-solid",
    bad: "bg-bad",
    warn: "bg-warn",
  }[tono];

  return (
    <div>
      {(label || detalle) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label && <span className="text-[13px] font-medium text-body">{label}</span>}
          {detalle && <span className="num text-[13px] font-bold text-strong">{detalle}</span>}
        </div>
      )}

      <div
        className="barra"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Avance"}
      >
        <div className={"barra-fill " + color} style={{ width: ancho + "%" }} />
      </div>
    </div>
  );
}

/**
 * Deslizador para elegir un numero sin teclear.
 *
 * Sirve donde el valor exacto importa menos que el tanteo: un descuento, un
 * porcentaje de comision, un interes. Siempre muestra el numero elegido,
 * porque un deslizador sin cifra obliga a adivinar.
 */
export function Deslizador({
  name,
  min,
  max,
  step = 1,
  defaultValue,
  label,
  sufijo = "",
  hint,
}: {
  name: string;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  label: string;
  /** Lo que va pegado al numero: "%", " cuotas". */
  sufijo?: string;
  hint?: string;
}) {
  const [valor, setValor] = useState(defaultValue);
  const pct = max > min ? ((valor - min) / (max - min)) * 100 : 0;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={"sl-" + name} className="text-[13px] font-medium text-body">
          {label}
        </label>
        <span className="num text-[15px] font-bold text-strong">
          {valor}
          {sufijo}
        </span>
      </div>

      <input
        id={"sl-" + name}
        name={name}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={valor}
        onChange={(e) => setValor(Number(e.target.value))}
        // El relleno a la izquierda del pulgar se pinta con el fondo, que es
        // la unica forma de tenirlo sin reescribir el control entero.
        style={{
          background:
            "linear-gradient(to right, rgb(var(--brand-600)) " +
            pct +
            "%, rgb(var(--surface-3)) " +
            pct +
            "%)",
        }}
      />

      {hint && <p className="mt-1.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
