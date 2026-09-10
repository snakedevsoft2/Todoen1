"use client";

import { useRef } from "react";
import { setAccountModuleAction } from "@/actions/admin";

/**
 * Tres estados y no dos.
 *
 * "De fabrica" no es lo mismo que "prendido": si mananase decide que Cartera
 * viene encendida para todos, las cuentas en "de fabrica" lo reciben solas y
 * las que alguien puso en "prendido" a mano tambien, pero las que quedaron en
 * "apagado" siguen sin verlo, que es justo lo que se queria.
 *
 * Guardar sin boton es a proposito: son decisiones de una sola cosa y tener
 * que acordarse de guardar solo produce cambios que se creen hechos y no lo
 * estan.
 */
export function InterruptorModulo({
  userId,
  moduleKey,
  label,
  valor,
  deFabrica,
}: {
  userId: string;
  moduleKey: string;
  label: string;
  valor: "sin_tocar" | "prendido" | "apagado";
  deFabrica: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={setAccountModuleAction} ref={formRef} className="shrink-0">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="moduleKey" value={moduleKey} />
      <label className="sr-only" htmlFor={"m-" + moduleKey}>
        {label}
      </label>
      <select
        id={"m-" + moduleKey}
        name="valor"
        defaultValue={valor}
        onChange={() => formRef.current?.requestSubmit()}
        className={
          "rounded-lg border bg-slate-900 px-2.5 py-1.5 text-xs font-bold transition focus:outline-none " +
          (valor === "apagado"
            ? "border-rose-800 text-rose-300"
            : valor === "prendido"
              ? "border-emerald-800 text-emerald-300"
              : "border-slate-700 text-slate-300")
        }
      >
        <option value="sin_tocar">
          De fábrica ({deFabrica ? "encendido" : "apagado"})
        </option>
        <option value="prendido">Prendido</option>
        <option value="apagado">Apagado</option>
      </select>
    </form>
  );
}
