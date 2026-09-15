"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { borrarClientesAction } from "@/actions/crm";
import { Pastilla } from "./EtiquetasCliente";
import { Alert, Badge } from "./ui";

export type FilaListaCliente = {
  id: string;
  name: string;
  iniciales: string;
  /** "300 123 4567 · hace 3 días", ya armado. */
  detalle: string;
  etiquetas: { id: string; name: string; color: string }[];
  pendientes: number;
  abiertas: number;
};

/**
 * La lista de clientes, con la opcion de borrar varios.
 *
 * Normalmente cada fila abre la ficha. Con "Seleccionar para borrar" las filas
 * se marcan: una por una, todas las que se ven, o todas las que coinciden con
 * la busqueda aunque no quepan en la pantalla. Borrar pide confirmar y dice que
 * se pierde. Solo el dueño lo ve.
 */
export function ListaClientes({
  clientes,
  puedeBorrar,
  totalFiltro,
  filtro,
}: {
  clientes: FilaListaCliente[];
  puedeBorrar: boolean;
  /** Cuantos coinciden con la busqueda y la etiqueta (sin filtro, todos). */
  totalFiltro: number;
  filtro: { q: string; t: string };
}) {
  const router = useRouter();
  const [eligiendo, setEligiendo] = useState(false);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [todosDelFiltro, setTodosDelFiltro] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pendiente, empezar] = useTransition();

  const cuantos = todosDelFiltro ? totalFiltro : elegidos.size;
  const todosVisibles = clientes.length > 0 && clientes.every((c) => elegidos.has(c.id));
  const filtrando = Boolean(filtro.q || filtro.t);

  function alternar(id: string) {
    setTodosDelFiltro(false);
    setConfirmar(false);
    setElegidos((antes) => {
      const s = new Set(antes);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function alternarTodos() {
    setConfirmar(false);
    if (todosVisibles || todosDelFiltro) {
      setTodosDelFiltro(false);
      setElegidos(new Set());
    } else {
      setElegidos(new Set(clientes.map((c) => c.id)));
    }
  }

  function salir() {
    setEligiendo(false);
    setElegidos(new Set());
    setTodosDelFiltro(false);
    setConfirmar(false);
  }

  function borrar() {
    empezar(async () => {
      try {
        const r = await borrarClientesAction(
          todosDelFiltro ? { todos: true, q: filtro.q, etiqueta: filtro.t } : { ids: [...elegidos] }
        );
        if (!r.ok) {
          setAviso({ kind: "error", text: r.error });
          return;
        }
        setAviso({ kind: "ok", text: r.borrados === 1 ? "Se borró 1 cliente." : "Se borraron " + r.borrados + " clientes." });
        salir();
        router.refresh();
      } catch {
        setAviso({ kind: "error", text: "No se pudo borrar. Revisa la conexión y vuelve a intentarlo." });
      }
    });
  }

  return (
    <div data-lista-clientes>
      {aviso && (
        <div className="mb-3">
          <Alert kind={aviso.kind}>{aviso.text}</Alert>
        </div>
      )}

      {puedeBorrar && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {!eligiendo ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setAviso(null);
                setEligiendo(true);
              }}
            >
              Seleccionar para borrar
            </button>
          ) : (
            <>
              <label className="flex items-center gap-2 text-[13px] font-semibold text-body">
                <input type="checkbox" className="h-4 w-4" checked={todosVisibles || todosDelFiltro} onChange={alternarTodos} />
                Seleccionar todos
              </label>
              <span className="text-[12px] text-muted" data-seleccionados>
                {cuantos} {cuantos === 1 ? "seleccionado" : "seleccionados"}
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  className="btn-ghost btn-sm text-bad"
                  disabled={cuantos === 0 || pendiente}
                  onClick={() => setConfirmar(true)}
                >
                  Borrar ({cuantos})
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={salir}>
                  Cancelar
                </button>
              </span>
            </>
          )}
        </div>
      )}

      {eligiendo && todosVisibles && !todosDelFiltro && totalFiltro > clientes.length && (
        <p className="mb-2 text-[12px] text-muted">
          Elegiste los {clientes.length} que se ven.{" "}
          <button type="button" className="link" onClick={() => setTodosDelFiltro(true)}>
            Elegir los {totalFiltro} clientes{filtrando ? " de esta búsqueda" : ""}
          </button>
        </p>
      )}

      {confirmar && cuantos > 0 && (
        <div data-confirmar-borrado className="mb-3 rounded-xl border border-bad/30 bg-surface p-3 text-[13px]">
          <p className="font-semibold text-bad">¿Borrar {cuantos === 1 ? "1 cliente" : cuantos + " clientes"}?</p>
          <p className="mt-1 text-muted">
            Se borran sus fichas con notas, etiquetas, seguimientos y oportunidades. Las ventas, los turnos y las deudas
            no se borran. No se puede deshacer.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-ghost btn-sm border-bad text-bad" onClick={borrar} disabled={pendiente}>
              {pendiente ? "Borrando…" : "Sí, borrar"}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmar(false)}>
              No
            </button>
          </div>
        </div>
      )}

      <ul className="animate-lista">
        {clientes.map((c) => {
          const marcado = todosDelFiltro || elegidos.has(c.id);
          const contenido = (
            <>
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white"
                aria-hidden
              >
                {c.iniciales}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-strong">{c.name}</span>
                <span className="block truncate text-xs text-muted">{c.detalle}</span>
                {c.etiquetas.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {c.etiquetas.map((e) => (
                      <Pastilla key={e.id} etiqueta={e} />
                    ))}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {c.pendientes > 0 && (
                  <Badge tone="amber">
                    {c.pendientes} {c.pendientes === 1 ? "pendiente" : "pendientes"}
                  </Badge>
                )}
                {c.abiertas > 0 && (
                  <Badge tone="blue">
                    {c.abiertas} {c.abiertas === 1 ? "venta abierta" : "ventas abiertas"}
                  </Badge>
                )}
              </span>
            </>
          );
          return (
            <li key={c.id} className="border-b border-line last:border-0">
              {eligiendo ? (
                <label
                  className={
                    "-mx-2 flex cursor-pointer items-center gap-3 rounded-xl px-2 py-3 transition-colors duration-150 " +
                    (marcado ? "bg-surface" : "hover:bg-surface")
                  }
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0"
                    checked={marcado}
                    onChange={() => alternar(c.id)}
                    aria-label={"Seleccionar " + c.name}
                  />
                  {contenido}
                </label>
              ) : (
                <Link
                  href={"/panel/clientes/" + c.id}
                  className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors duration-150 hover:bg-surface"
                >
                  {contenido}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
