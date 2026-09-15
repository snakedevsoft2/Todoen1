"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { moverProductosAction } from "@/actions/categorias";
import {
  CATEGORIA_GENERAL,
  MAX_CATEGORIA,
  agruparPorCategoria,
  categoriasConCantidad,
  coincideBusqueda,
  nombreCategoria,
  type OrdenCatalogo,
} from "@/lib/categorias";
import { BarraCatalogo } from "./BarraCatalogo";
import { Icon } from "./Icon";
import { Alert } from "./ui";

export type ItemCatalogo = {
  id: string;
  name: string;
  price: number;
  category: string;
  createdAt: number;
  active: boolean;
  /** Donde se busca: nombre, marca, descripcion. */
  textos: (string | null)[];
  /** La ficha ya armada en el servidor, con sus botones y su formulario. */
  nodo: ReactNode;
};

/** Con mas productos que esto, las categorias arrancan cerradas. */
const ABIERTAS_HASTA = 12;

/** Valor del selector para escribir una categoria nueva. */
const NUEVA = "__nueva__";

/**
 * La lista de productos del panel, por categorias que se abren y se cierran,
 * con buscador y orden.
 *
 * El dueño puede seleccionar productos (uno a uno, o los que deja el buscador)
 * y meterlos de una en una categoria, ya creada o nueva.
 *
 * Las fichas no se desmontan al filtrar: solo se esconden, para que un
 * "Editar" a medio llenar no se pierda al tocar otra categoria.
 */
export function CatalogoFiltrado({
  items,
  ordenCategorias,
  puedeMover = false,
}: {
  items: ItemCatalogo[];
  /** El orden de categorias que armo el dueño. */
  ordenCategorias?: string[];
  /** Solo el dueño mueve productos de categoria. */
  puedeMover?: boolean;
}) {
  const router = useRouter();
  const [categoria, setCategoria] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<OrdenCatalogo>("nombre");
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});

  const [eligiendo, setEligiendo] = useState(false);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("");
  const [nueva, setNueva] = useState("");
  const [aviso, setAviso] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pendiente, empezar] = useTransition();

  const categorias = useMemo(() => categoriasConCantidad(items, ordenCategorias), [items, ordenCategorias]);
  const grupos = useMemo(() => {
    // Los inactivos, al final de su categoria.
    return agruparPorCategoria(items, orden, ordenCategorias).map((g) => ({
      ...g,
      items: [...g.items.filter((i) => i.active), ...g.items.filter((i) => !i.active)],
    }));
  }, [items, orden, ordenCategorias]);

  const buscando = busqueda.trim() !== "";
  const unaSola = categorias.length <= 1;
  const visibles = new Set(items.filter((i) => coincideBusqueda([i.name, i.category, ...i.textos], busqueda)).map((i) => i.id));
  const enPantalla = items.filter(
    (i) => visibles.has(i.id) && (!categoria || nombreCategoria(i.category) === categoria)
  );
  const cuantos = enPantalla.length;

  // Destinos: las categorias del dueño, General y una nueva.
  const destinos = [...new Set([...(ordenCategorias ?? []), CATEGORIA_GENERAL])];
  const destinoActual = destino === NUEVA || destinos.includes(destino) ? destino : (ordenCategorias?.[0] ?? NUEVA);
  const nombreDestino = destinoActual === NUEVA ? nueva.trim() : destinoActual;
  const todosEnPantalla = cuantos > 0 && enPantalla.every((i) => elegidos.has(i.id));

  function estaAbierta(nombre: string) {
    if (unaSola || buscando || categoria || eligiendo) return true;
    return abiertas[nombre] ?? items.length <= ABIERTAS_HASTA;
  }

  function alternar(id: string) {
    setElegidos((antes) => {
      const s = new Set(antes);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function alternarEnPantalla() {
    setElegidos((antes) => {
      const s = new Set(antes);
      for (const i of enPantalla) {
        if (todosEnPantalla) s.delete(i.id);
        else s.add(i.id);
      }
      return s;
    });
  }

  function salir() {
    setEligiendo(false);
    setElegidos(new Set());
    setNueva("");
  }

  function mover() {
    const ids = [...elegidos];
    empezar(async () => {
      try {
        const r = await moverProductosAction(ids, nombreDestino);
        if (r?.error) {
          setAviso({ kind: "error", text: r.error });
          return;
        }
        setAviso({ kind: "ok", text: r?.ok ?? "Listo." });
        if (destinoActual === NUEVA) setDestino("");
        salir();
        router.refresh();
      } catch {
        setAviso({ kind: "error", text: "No se pudo mover. Revisa la conexión y vuelve a intentarlo." });
      }
    });
  }

  return (
    <div className="space-y-4">
      <BarraCatalogo
        categorias={categorias}
        total={items.length}
        categoria={categoria}
        onCategoria={setCategoria}
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        orden={orden}
        onOrden={setOrden}
        placeholder="Buscar producto, marca..."
        pegajosa={items.length > 6}
        className="top-[60px] lg:top-3"
      />

      {aviso && <Alert kind={aviso.kind}>{aviso.text}</Alert>}

      {puedeMover && !eligiendo && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            setAviso(null);
            setEligiendo(true);
          }}
          data-seleccionar-productos
        >
          <Icon name="tag" className="h-4 w-4" />
          Seleccionar y mover a una categoría
        </button>
      )}

      {!unaSola && !buscando && !categoria && !eligiendo && (
        <div className="flex justify-end gap-3 text-xs">
          <button type="button" className="link" onClick={() => setAbiertas(Object.fromEntries(categorias.map((c) => [c.nombre, true])))}>
            Abrir todas
          </button>
          <button type="button" className="link" onClick={() => setAbiertas(Object.fromEntries(categorias.map((c) => [c.nombre, false])))}>
            Cerrar todas
          </button>
        </div>
      )}

      {cuantos === 0 && (
        <div className="rounded-xl border border-dashed border-line p-5 text-center text-[13px] text-muted" data-sin-resultados>
          No hay productos con “{busqueda.trim() || categoria}”.{" "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setBusqueda("");
              setCategoria("");
            }}
          >
            Ver todos
          </button>
        </div>
      )}

      <div className="space-y-3">
        {grupos.map((g) => {
          const enGrupo = g.items.filter((i) => visibles.has(i.id)).length;
          const escondido = (categoria !== "" && categoria !== g.nombre) || enGrupo === 0;
          const abierta = estaAbierta(g.nombre);
          const fijo = buscando || categoria !== "" || eligiendo;

          return (
            <section key={g.nombre} hidden={escondido} data-grupo-categoria={g.nombre} data-abierta={abierta ? "si" : "no"}>
              {unaSola ? null : (
                <button
                  type="button"
                  onClick={() => setAbiertas((prev) => ({ ...prev, [g.nombre]: !abierta }))}
                  disabled={fijo}
                  aria-expanded={abierta}
                  className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-left"
                >
                  <span className="text-[13px] font-semibold text-strong">
                    {g.nombre}
                    <span className="ml-2 rounded-full bg-panel px-2 py-0.5 text-[11px] font-medium text-muted">
                      {buscando ? enGrupo + " de " + g.items.length : g.items.length}
                    </span>
                  </span>
                  {!fijo && <Icon name="plus" className={"h-4 w-4 text-muted transition " + (abierta ? "rotate-45" : "")} />}
                </button>
              )}
              <ul className="space-y-2" hidden={!abierta}>
                {g.items.map((i) => (
                  <li
                    key={i.id}
                    hidden={!visibles.has(i.id)}
                    className={
                      "rounded-xl border bg-surface p-3 " +
                      (eligiendo && elegidos.has(i.id) ? "border-brand-500 ring-1 ring-brand-500" : "border-line")
                    }
                    data-producto={i.name}
                  >
                    <div className="flex gap-3">
                      {eligiendo && (
                        <input
                          type="checkbox"
                          className="mt-0.5 h-5 w-5 shrink-0"
                          checked={elegidos.has(i.id)}
                          onChange={() => alternar(i.id)}
                          aria-label={"Seleccionar " + i.name}
                        />
                      )}
                      <div className="min-w-0 flex-1">{i.nodo}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Barra para mover: queda abajo, a la mano, mientras se marcan productos. */}
      {eligiendo && (
        <div
          className="sticky bottom-[84px] z-20 space-y-2 rounded-2xl border border-line bg-panel p-3 shadow-card lg:bottom-3"
          data-mover-productos
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label className="flex items-center gap-2 text-[13px] font-semibold text-body">
              <input type="checkbox" className="h-4 w-4" checked={todosEnPantalla} onChange={alternarEnPantalla} disabled={cuantos === 0} />
              Seleccionar los que se ven ({cuantos})
            </label>
            <span className="text-[12px] text-muted" data-seleccionados>
              {elegidos.size} {elegidos.size === 1 ? "seleccionado" : "seleccionados"}
            </span>
            <button type="button" className="link ml-auto text-[13px]" onClick={salir}>
              Cancelar
            </button>
          </div>

          {/* En el celular va apilado: el selector no se aplasta cuando aparece
              el nombre de la categoria nueva. */}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
              <span className="shrink-0">Mover a</span>
              <select
                className="input min-w-0 flex-1"
                value={destinoActual}
                onChange={(e) => setDestino(e.target.value)}
                data-destino-categoria
              >
                {destinos.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                <option value={NUEVA}>+ Nueva categoría…</option>
              </select>
            </label>
            {destinoActual === NUEVA && (
              <input
                className="input min-w-0 sm:col-start-1"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                maxLength={MAX_CATEGORIA}
                placeholder="Nombre de la categoría nueva"
                aria-label="Nombre de la categoría nueva"
                autoFocus
                data-nueva-categoria
              />
            )}
            <button
              type="button"
              className="btn-primary btn-sm w-full justify-center sm:col-start-2 sm:row-start-1 sm:w-auto"
              onClick={mover}
              disabled={elegidos.size === 0 || pendiente || !nombreDestino}
            >
              {pendiente ? "Moviendo..." : "Mover (" + elegidos.size + ")"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
