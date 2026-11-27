"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { contarMecatoAction } from "@/actions/mecato-mb";
import type { ModoConteo } from "@/lib/mecato-mb";
import { Alert } from "./ui";

export type GrupoContar = {
  categoria: string;
  productos: { clave: string; name: string; stock: number; contado: boolean }[];
};

/**
 * Cargar o contar todo el mecato de MB Nails en una sola pantalla (ver
 * actions/mecato-mb.ts). Va con onSubmit y no con action={}: si una cantidad
 * esta mal, lo demas que escribio no se borra.
 */
export function ContarMecato({ grupos }: { grupos: GrupoContar[] }) {
  const [state, accion, guardando] = useActionState(contarMecatoAction, undefined);
  const [modo, setModo] = useState<ModoConteo>("entrada");
  const form = useRef<HTMLFormElement>(null);

  // Guardado: los campos quedan en blanco para la proxima vez.
  useEffect(() => {
    if (!state?.ok || !form.current) return;
    for (const input of form.current.querySelectorAll<HTMLInputElement>('input[type="number"]')) input.value = "";
  }, [state]);

  const opciones: { key: ModoConteo; label: string; ayuda: string }[] = [
    { key: "entrada", label: "Llegó mercancía", ayuda: "Escribe cuántas llegaron: se suman a lo que hay." },
    { key: "conteo", label: "Contar lo que hay", ayuda: "Escribe cuántas hay ahora: reemplaza lo anotado." },
  ];

  return (
    <form
      ref={form}
      data-contar-mecato
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => accion(datos));
      }}
    >
      <input type="hidden" name="modo" value={modo} />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Qué vas a hacer">
        {opciones.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={modo === o.key}
            data-modo={o.key}
            onClick={() => setModo(o.key)}
            className={(modo === o.key ? "btn-primary" : "btn-ghost") + " btn-sm justify-center"}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        {opciones.find((o) => o.key === modo)!.ayuda} Lo que dejes en blanco no cambia. Lo que diga{" "}
        <strong>sin contar</strong> empieza con lo que escribas.
      </p>

      {grupos.map((g) => (
        <fieldset key={g.categoria}>
          <legend className="eyebrow mb-1.5">{g.categoria}</legend>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {g.productos.map((p) => (
              <li key={p.clave} className="flex items-center gap-3 px-3 py-2">
                <label htmlFor={"c-" + p.clave} className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-strong [overflow-wrap:anywhere]">{p.name}</span>
                  <span className={"block text-[11px] " + (p.contado ? "text-subtle" : "text-warn")}>
                    {p.contado ? "Hay " + p.stock : "Sin contar"}
                  </span>
                </label>
                <input
                  id={"c-" + p.clave}
                  name={p.clave}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  placeholder={!p.contado ? "Hay" : modo === "entrada" ? "+0" : String(p.stock)}
                  className="input w-20 shrink-0 text-center"
                />
              </li>
            ))}
          </ul>
        </fieldset>
      ))}

      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
      <button type="submit" disabled={guardando} className="btn-primary w-full justify-center">
        {guardando ? "Guardando…" : modo === "entrada" ? "Sumar lo que llegó" : "Guardar el conteo"}
      </button>
    </form>
  );
}
