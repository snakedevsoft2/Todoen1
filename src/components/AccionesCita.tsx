"use client";

import { useActionState, useMemo, useState } from "react";
import { cerrarCitaAction, reprogramarCitaAction } from "@/actions/mis-citas";
import { money, parseMoney, pretty12h } from "@/lib/format";
import type { AdicionalPedido } from "@/lib/cobro-cita";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

/**
 * Los dos botones de cada cita de la manicurista (MB Nails): Cerrada y
 * Reprogramada. Cerrada cobra el servicio a su precio y deja agregar lo
 * adicional: algo de la lista de precios (con su precio, que no se cambia) u
 * "otro" con el valor que ella escribe. El servidor vuelve a sacar cada
 * precio de la base: lo de aqui es solo para que vea el total.
 */

export type ProductoLista = { id: string; name: string; price: number; category: string };

type Linea =
  | { key: number; tipo: "lista"; serviceId: string; name: string; price: number; qty: number }
  | { key: number; tipo: "otro"; nombre: string; valor: string };

export function AccionesCita({
  cita,
  lista,
  horas,
  hoy,
  currency,
  ceros,
}: {
  cita: { id: string; serviceName: string; price: number; day: string; startTime: string };
  lista: ProductoLista[];
  /** Las horas de la agenda ("09:00", "09:30"...). */
  horas: string[];
  hoy: string;
  currency: string;
  ceros: number;
}) {
  const [abierto, setAbierto] = useState<"cerrar" | "reprogramar" | null>(null);

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAbierto(abierto === "cerrar" ? null : "cerrar")}
          className={"btn-success justify-center py-3 text-base" + (abierto === "cerrar" ? " ring-2 ring-offset-1" : "")}
          aria-expanded={abierto === "cerrar"}
          data-boton-cerrada
        >
          <Icon name="check" className="h-5 w-5" />
          Cerrada
        </button>
        <button
          type="button"
          onClick={() => setAbierto(abierto === "reprogramar" ? null : "reprogramar")}
          className={"btn-ghost justify-center py-3 text-base" + (abierto === "reprogramar" ? " ring-2 ring-offset-1" : "")}
          aria-expanded={abierto === "reprogramar"}
          data-boton-reprogramada
        >
          <Icon name="calendar" className="h-5 w-5" />
          Reprogramada
        </button>
      </div>

      {abierto === "cerrar" && <CerrarCita cita={cita} lista={lista} currency={currency} ceros={ceros} />}
      {abierto === "reprogramar" && <ReprogramarCita cita={cita} horas={horas} hoy={hoy} />}
    </div>
  );
}

function CerrarCita({
  cita,
  lista,
  currency,
  ceros,
}: {
  cita: { id: string; serviceName: string; price: number };
  lista: ProductoLista[];
  currency: string;
  ceros: number;
}) {
  const [state, formAction] = useActionState(cerrarCitaAction, undefined);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [elegido, setElegido] = useState("");
  const [otroNombre, setOtroNombre] = useState("");
  const [otroValor, setOtroValor] = useState("");
  const [siguiente, setSiguiente] = useState(1);

  const porCategoria = useMemo(() => {
    const m = new Map<string, ProductoLista[]>();
    for (const p of lista) m.set(p.category, [...(m.get(p.category) ?? []), p]);
    return [...m.entries()];
  }, [lista]);

  const valorDe = (l: Linea) => (l.tipo === "lista" ? l.price * l.qty : parseMoney(l.valor, currency, ceros));
  const total = cita.price + lineas.reduce((s, l) => s + valorDe(l), 0);

  const agregarDeLista = () => {
    const p = lista.find((x) => x.id === elegido);
    if (!p) return;
    setLineas((ls) => {
      const ya = ls.find((l) => l.tipo === "lista" && l.serviceId === p.id);
      if (ya) return ls.map((l) => (l === ya && l.tipo === "lista" ? { ...l, qty: Math.min(20, l.qty + 1) } : l));
      return [...ls, { key: siguiente, tipo: "lista", serviceId: p.id, name: p.name, price: p.price, qty: 1 }];
    });
    setSiguiente((n) => n + 1);
    setElegido("");
  };
  const agregarOtro = () => {
    if (!otroNombre.trim() || parseMoney(otroValor, currency, ceros) <= 0) return;
    setLineas((ls) => [...ls, { key: siguiente, tipo: "otro", nombre: otroNombre.trim(), valor: otroValor }]);
    setSiguiente((n) => n + 1);
    setOtroNombre("");
    setOtroValor("");
  };

  const pedidos: AdicionalPedido[] = lineas.map((l) =>
    l.tipo === "lista" ? { tipo: "lista", serviceId: l.serviceId, qty: l.qty } : { tipo: "otro", nombre: l.nombre, valor: l.valor }
  );

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-xl border border-line bg-panel p-3" data-cerrar-cita>
      <input type="hidden" name="id" value={cita.id} />
      <input type="hidden" name="adicionales" value={JSON.stringify(pedidos)} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <ul className="space-y-1.5 text-sm">
        <li className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 text-strong">{cita.serviceName}</span>
          <span className="shrink-0 font-semibold text-strong">{money(cita.price, currency)}</span>
        </li>
        {lineas.map((l) => (
          <li key={l.key} className="flex items-baseline justify-between gap-2" data-adicional>
            <span className="min-w-0 text-body">
              + {l.tipo === "lista" ? (l.qty > 1 ? l.qty + "x " : "") + l.name : l.nombre}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-semibold text-strong">{money(valorDe(l), currency)}</span>
              <button
                type="button"
                onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))}
                className="rounded-md p-1 text-muted hover:bg-surface hover:text-bad"
                aria-label="Quitar"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-2 border-t border-line pt-1.5">
          <span className="font-semibold text-strong">Total</span>
          <span className="text-lg font-bold text-strong" data-total-cita>
            {money(total, currency)}
          </span>
        </li>
      </ul>

      <div className="space-y-2 rounded-lg border border-dashed border-line p-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">¿Le agregaste algo más?</p>
        <div className="flex gap-2">
          <select className="input min-w-0 flex-1" value={elegido} onChange={(e) => setElegido(e.target.value)} aria-label="De la lista de precios" data-elegir-adicional>
            <option value="">De la lista de precios…</option>
            {porCategoria.map(([categoria, productos]) => (
              <optgroup key={categoria} label={categoria}>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {money(p.price, currency)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" className="btn-ghost btn-sm shrink-0" onClick={agregarDeLista} disabled={!elegido} data-agregar-de-lista>
            <Icon name="plus" className="h-4 w-4" />
            Agregar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="input min-w-0 flex-[2]"
            value={otroNombre}
            onChange={(e) => setOtroNombre(e.target.value)}
            placeholder="Otro: decorado, piedras…"
            maxLength={80}
            aria-label="Qué fue lo adicional"
            data-otro-nombre
          />
          <input
            className="input w-28 flex-1"
            value={otroValor}
            onChange={(e) => setOtroValor(e.target.value)}
            inputMode="numeric"
            placeholder="Valor"
            aria-label="Cuánto vale"
            data-otro-valor
          />
          <button
            type="button"
            className="btn-ghost btn-sm shrink-0"
            onClick={agregarOtro}
            disabled={!otroNombre.trim() || parseMoney(otroValor, currency, ceros) <= 0}
            data-agregar-otro
          >
            <Icon name="plus" className="h-4 w-4" />
            Agregar
          </button>
        </div>
      </div>

      <Field label="Cómo pagó">
        <select className="input" name="paymentMethod" defaultValue="EFECTIVO">
          <option value="EFECTIVO">Efectivo</option>
          <option value="TRANSFERENCIA">Transferencia</option>
          <option value="TARJETA">Tarjeta</option>
          <option value="OTRO">Otro</option>
        </select>
      </Field>

      <SubmitButton
        className="btn-success w-full justify-center py-3 text-base"
        pendingText="Guardando…"
        confirm={"¿Cerrar la cita y cobrar " + money(total, currency) + "?"}
      >
        Guardar como cerrada · {money(total, currency)}
      </SubmitButton>
    </form>
  );
}

function ReprogramarCita({
  cita,
  horas,
  hoy,
}: {
  cita: { id: string; day: string; startTime: string };
  horas: string[];
  hoy: string;
}) {
  const [state, formAction] = useActionState(reprogramarCitaAction, undefined);
  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-xl border border-line bg-panel p-3" data-reprogramar-cita>
      <input type="hidden" name="id" value={cita.id} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nuevo día">
          <input className="input" type="date" name="day" min={hoy} defaultValue={cita.day < hoy ? hoy : cita.day} required />
        </Field>
        <Field label="Nueva hora">
          <select className="input" name="startTime" defaultValue={cita.startTime} required>
            {horas.map((h) => (
              <option key={h} value={h}>
                {pretty12h(h)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <SubmitButton className="btn-primary w-full justify-center py-3 text-base" pendingText="Moviendo…">
        Guardar nueva fecha
      </SubmitButton>
    </form>
  );
}
