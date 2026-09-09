"use client";

import { useActionState, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { saveWorkspaceAction } from "@/actions/workspace";
import { SubmitButton } from "./SubmitButton";
import { Alert } from "./ui";
import { Icon } from "./Icon";

export type WorkspaceItem = {
  key: string;
  label: string;
  icon: string;
  /** Una linea que explica para que sirve, en palabras del oficio. */
  short: string;
  example: string | null;
  /** Los fijos no se pueden esconder: sin ellos no habria como volver. */
  fixed: boolean;
  visible: boolean;
};

type FilaProps = {
  item: WorkspaceItem;
  index: number;
  total: number;
  onMover: (index: number, delta: number) => void;
  onAlternar: (key: string) => void;
};

function Fila({ item, index, total, onMover, onAlternar }: FilaProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        "flex items-start gap-3 bg-panel px-3 py-2.5 " +
        (isDragging ? "relative z-10 shadow-[4px_4px_0_0_var(--edge)]" : "") +
        (item.visible ? "" : " bg-surface opacity-60")
      }
    >
      {/* Agarradera: arrastrar con el dedo o el mouse.
          Las flechas de al lado hacen lo mismo, para quien no pueda arrastrar. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-1 shrink-0 cursor-grab touch-none rounded border-2 border-transparent px-1 text-subtle transition hover:text-strong focus-visible:border-edge focus-visible:ring-4 focus-visible:ring-brand-500/40 active:cursor-grabbing"
        aria-label={"Mover " + item.label + ". Posicion " + (index + 1) + " de " + total}
      >
        <Icon name="grip" className="h-4 w-4" />
      </button>

      <span className="mt-0.5 flex shrink-0 flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onMover(index, -1)}
          disabled={index === 0}
          className="rounded border-2 border-edge px-1.5 leading-none text-strong transition disabled:opacity-25"
          aria-label={"Subir " + item.label}
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => onMover(index, 1)}
          disabled={index === total - 1}
          className="rounded border-2 border-edge px-1.5 leading-none text-strong transition disabled:opacity-25"
          aria-label={"Bajar " + item.label}
        >
          ▼
        </button>
      </span>

      <span
        className={
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-edge " +
          (item.visible ? "bg-brand-600 text-on-brand" : "bg-panel text-subtle")
        }
      >
        <Icon name={item.icon} className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-strong">{item.label}</span>
        <span className="block text-[11px] leading-snug text-subtle">{item.short}</span>
        {item.example && (
          <span className="mt-1 block text-[11px] italic leading-snug text-muted">
            Por ejemplo: {item.example}
          </span>
        )}
      </span>

      <label
        className={
          "relative mt-1 inline-flex shrink-0 items-center " +
          (item.fixed ? "cursor-not-allowed opacity-40" : "cursor-pointer")
        }
      >
        <input
          type="checkbox"
          name="visible"
          value={item.key}
          checked={item.visible}
          onChange={() => onAlternar(item.key)}
          disabled={item.fixed}
          className="peer sr-only"
          aria-label={"Mostrar " + item.label}
        />
        {/* La casilla real esta oculta, asi que el foco del teclado tiene que
            verse aqui o no se ve en ninguna parte. */}
        <span className="h-6 w-11 rounded-full border-2 border-edge bg-surface transition peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/40" />
        <span className="absolute left-1 h-4 w-4 rounded-full border-2 border-edge bg-panel transition peer-checked:translate-x-5" />
      </label>
    </li>
  );
}

/**
 * Editor del espacio de trabajo.
 *
 * Cada apartado se prende o se apaga con un interruptor y se mueve de tres
 * maneras: arrastrando la agarradera, con las flechas, o con el teclado. Las
 * tres a proposito: arrastrar con el dedo dentro de una lista que ademas hace
 * scroll falla en celulares viejos, y ahi las flechas salvan el dia.
 *
 * Esconder un apartado no lo borra: sigue funcionando si se llega por su
 * direccion o desde un boton de otra pantalla. Solo deja de estorbar.
 */
export function WorkspaceForm({ items }: { items: WorkspaceItem[] }) {
  const [state, formAction] = useActionState(saveWorkspaceAction, undefined);
  const [lista, setLista] = useState(items);

  const visibles = lista.filter((i) => i.visible).length;

  // La distancia y la espera evitan que un toque para prender el interruptor
  // se interprete como el comienzo de un arrastre.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function mover(index: number, delta: number) {
    const destino = index + delta;
    if (destino < 0 || destino >= lista.length) return;
    setLista((prev) => arrayMove(prev, index, destino));
  }

  function alSoltar(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLista((prev) => {
      const desde = prev.findIndex((i) => i.key === active.id);
      const hasta = prev.findIndex((i) => i.key === over.id);
      if (desde < 0 || hasta < 0) return prev;
      return arrayMove(prev, desde, hasta);
    });
  }

  function alternar(key: string) {
    setLista((prev) =>
      prev.map((i) => (i.key === key && !i.fixed ? { ...i, visible: !i.visible } : i))
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <input type="hidden" name="order" value={lista.map((i) => i.key).join(",")} />

      <p className="text-sm text-body">
        Deja prendido solo lo que uses. Arrastra por la agarradera para cambiar el orden. Lo que
        apagues no se borra: sigue ahí si entras por su dirección, pero no te estorba en el menú.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={alSoltar}
      >
        <SortableContext items={lista.map((i) => i.key)} strategy={verticalListSortingStrategy}>
          <ul className="divide-y-2 divide-line overflow-hidden rounded-xl border-2 border-edge bg-panel">
            {lista.map((item, i) => (
              <Fila
                key={item.key}
                item={item}
                index={i}
                total={lista.length}
                onMover={mover}
                onAlternar={alternar}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="btn-primary" pendingText="Guardando...">
          <Icon name="check" className="h-4 w-4" />
          Guardar mi espacio
        </SubmitButton>
        <span className="text-xs text-subtle">
          {visibles} de {lista.length} apartados prendidos
        </span>
      </div>

      <p className="text-xs text-subtle">
        En el celular, los <strong>primeros cinco</strong> prendidos son los que salen en la barra
        de abajo. Sube lo que más uses.
      </p>
    </form>
  );
}
