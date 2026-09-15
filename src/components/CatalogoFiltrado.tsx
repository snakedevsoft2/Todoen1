"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  agruparPorCategoria,
  categoriasConCantidad,
  coincideBusqueda,
  nombreCategoria,
  type OrdenCatalogo,
} from "@/lib/categorias";
import { BarraCatalogo } from "./BarraCatalogo";
import { Icon } from "./Icon";

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

/**
 * La lista de productos del panel, por categorias que se abren y se cierran,
 * con buscador y orden.
 *
 * Las fichas no se desmontan al filtrar: solo se esconden, para que un
 * "Editar" a medio llenar no se pierda al tocar otra categoria.
 */
export function CatalogoFiltrado({
  items,
  ordenCategorias,
}: {
  items: ItemCatalogo[];
  /** El orden de categorias que armo el dueño. */
  ordenCategorias?: string[];
}) {
  const [categoria, setCategoria] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<OrdenCatalogo>("nombre");
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});

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
  const cuantos = items.filter(
    (i) => visibles.has(i.id) && (!categoria || nombreCategoria(i.category) === categoria)
  ).length;

  function estaAbierta(nombre: string) {
    if (unaSola || buscando || categoria) return true;
    return abiertas[nombre] ?? items.length <= ABIERTAS_HASTA;
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

      {!unaSola && !buscando && !categoria && (
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

          return (
            <section key={g.nombre} hidden={escondido} data-grupo-categoria={g.nombre} data-abierta={abierta ? "si" : "no"}>
              {unaSola ? null : (
                <button
                  type="button"
                  onClick={() => setAbiertas((prev) => ({ ...prev, [g.nombre]: !abierta }))}
                  disabled={buscando || categoria !== ""}
                  aria-expanded={abierta}
                  className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-left"
                >
                  <span className="text-[13px] font-semibold text-strong">
                    {g.nombre}
                    <span className="ml-2 rounded-full bg-panel px-2 py-0.5 text-[11px] font-medium text-muted">
                      {buscando ? enGrupo + " de " + g.items.length : g.items.length}
                    </span>
                  </span>
                  {!buscando && categoria === "" && (
                    <Icon name="plus" className={"h-4 w-4 text-muted transition " + (abierta ? "rotate-45" : "")} />
                  )}
                </button>
              )}
              <ul className="space-y-2" hidden={!abierta}>
                {g.items.map((i) => (
                  <li key={i.id} hidden={!visibles.has(i.id)} className="rounded-xl border border-line bg-surface p-3" data-producto={i.name}>
                    {i.nodo}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
