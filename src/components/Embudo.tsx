"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { moverOportunidadAction } from "@/actions/crm";
import { ETAPAS, esEtapa, type Etapa, type Tono } from "@/lib/crm";
import { money, shortDay } from "@/lib/format";
import { Alert } from "./ui";
import { Icon } from "./Icon";

export type Tarjeta = {
  id: string;
  title: string;
  value: number;
  stage: Etapa;
  customerId: string;
  customerName: string;
  staffName: string | null;
  expectedDay: string | null;
};

const PUNTO: Record<Tono, string> = {
  slate: "bg-subtle",
  blue: "bg-brand-500",
  amber: "bg-warn",
  green: "bg-good",
  red: "bg-bad",
};

function Contenido({
  t,
  currency,
  alMover,
  asa,
}: {
  t: Tarjeta;
  currency: string;
  alMover?: (etapa: Etapa) => void;
  asa?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={"/panel/clientes/" + t.customerId}
            className="block truncate text-[13px] font-semibold text-muted hover:text-strong"
          >
            {t.customerName}
          </Link>
          <p className="mt-0.5 text-sm font-semibold text-strong [overflow-wrap:anywhere]">{t.title}</p>
        </div>
        {asa}
      </div>
      <p className="mt-2 font-display text-base text-strong num">{money(t.value, currency)}</p>
      {(t.staffName || t.expectedDay) && (
        <p className="mt-1 text-[11px] text-subtle">
          {t.staffName}
          {t.staffName && t.expectedDay ? " · " : ""}
          {t.expectedDay ? "cierra " + shortDay(t.expectedDay) : ""}
        </p>
      )}
      {alMover && (
        // El selector es la forma de moverla sin arrastrar: en un telefono
        // pequeño, o con teclado, arrastrar entre columnas es incomodo.
        <select
          className="input mt-2 h-8 py-0 text-[13px]"
          value={t.stage}
          onChange={(e) => esEtapa(e.target.value) && alMover(e.target.value)}
          aria-label={"Mover " + t.title}
        >
          {ETAPAS.map((e) => (
            <option key={e.key} value={e.key}>
              {e.label}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

function TarjetaArrastrable({
  t,
  currency,
  alMover,
}: {
  t: Tarjeta;
  currency: string;
  alMover: (etapa: Etapa) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id });
  return (
    <li
      ref={setNodeRef}
      data-oportunidad={t.id}
      className={
        "rounded-xl border border-line bg-panel p-3 shadow-card transition-opacity duration-150 " +
        (isDragging ? "opacity-40" : "")
      }
    >
      <Contenido
        t={t}
        currency={currency}
        alMover={alMover}
        asa={
          <button
            type="button"
            className="-mr-1 -mt-1 cursor-grab touch-none rounded-md p-1 text-subtle hover:bg-surface hover:text-strong active:cursor-grabbing"
            aria-label={"Arrastrar " + t.title}
            {...attributes}
            {...listeners}
          >
            <Icon name="grip" className="h-4 w-4" />
          </button>
        }
      />
    </li>
  );
}

function Columna({
  etapa,
  tarjetas,
  currency,
  alMover,
}: {
  etapa: (typeof ETAPAS)[number];
  tarjetas: Tarjeta[];
  currency: string;
  alMover: (id: string, etapa: Etapa) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.key });
  const total = tarjetas.reduce((s, t) => s + t.value, 0);

  return (
    <section
      ref={setNodeRef}
      data-etapa={etapa.key}
      aria-label={etapa.label}
      className={
        "flex w-[272px] shrink-0 snap-start flex-col rounded-2xl border bg-surface p-2.5 transition-all duration-200 ease-suave " +
        (isOver ? "border-brand-500 ring-4 ring-brand-500/15" : "border-line")
      }
    >
      <header className="mb-2.5 px-1">
        <p className="flex items-center gap-2 text-sm font-bold text-strong">
          <span className={"h-2 w-2 rounded-full " + PUNTO[etapa.tono]} aria-hidden />
          {etapa.label}
          <span className="ml-auto rounded-full bg-panel px-2 text-[12px] font-semibold text-muted num">
            {tarjetas.length}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-subtle num">{money(total, currency)}</p>
      </header>

      <ul className="flex min-h-[96px] flex-1 flex-col gap-2">
        {tarjetas.map((t) => (
          <TarjetaArrastrable key={t.id} t={t} currency={currency} alMover={(e) => alMover(t.id, e)} />
        ))}
        {tarjetas.length === 0 && (
          <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-xs text-subtle">
            {etapa.hint}
          </li>
        )}
      </ul>
    </section>
  );
}

/**
 * El embudo de ventas como tablero.
 *
 * El cambio se ve al instante y se guarda por detras. Si el servidor dice que
 * no, la tarjeta vuelve a donde estaba y se explica por que: peor que un
 * tablero lento es uno que muestra algo que no quedo guardado.
 */
export function Embudo({ tarjetas, currency }: { tarjetas: Tarjeta[]; currency: string }) {
  const [lista, setLista] = useState(tarjetas);
  const [error, setError] = useState<string | null>(null);
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => setLista(tarjetas), [tarjetas]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  function mover(id: string, etapa: Etapa) {
    const antes = lista;
    const actual = antes.find((t) => t.id === id);
    if (!actual || actual.stage === etapa) return;
    setError(null);
    setLista(antes.map((t) => (t.id === id ? { ...t, stage: etapa } : t)));
    startTransition(async () => {
      const r = await moverOportunidadAction(id, etapa).catch(() => ({
        ok: false,
        error: "Sin conexión. No se movió.",
      }));
      if (!r.ok) {
        setLista(antes);
        setError(r.error ?? "No se pudo mover.");
      }
    });
  }

  function alSoltar({ active, over }: DragEndEvent) {
    setArrastrada(null);
    const etapa = over ? String(over.id) : "";
    if (esEtapa(etapa)) mover(String(active.id), etapa);
  }

  const enMano = lista.find((t) => t.id === arrastrada);

  return (
    <div>
      {error && (
        <div className="mb-3">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setArrastrada(String(active.id))}
        onDragCancel={() => setArrastrada(null)}
        onDragEnd={alSoltar}
      >
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3">
          {ETAPAS.map((e) => (
            <Columna
              key={e.key}
              etapa={e}
              tarjetas={lista.filter((t) => t.stage === e.key)}
              currency={currency}
              alMover={mover}
            />
          ))}
        </div>
        {/* La copia que sigue al dedo va fuera de las columnas: dentro, el
            desplazamiento horizontal la recortaria al salir de su columna. */}
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
          {enMano ? (
            <div className="w-[248px] rotate-2 rounded-xl border border-brand-500 bg-panel p-3 shadow-card-hover">
              <Contenido t={enMano} currency={currency} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
