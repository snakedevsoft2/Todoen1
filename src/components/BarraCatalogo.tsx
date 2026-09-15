"use client";

import { ORDENES, esOrden, type OrdenCatalogo } from "@/lib/categorias";
import { Icon } from "./Icon";

/**
 * Buscador, categorias y orden encima de una lista de productos.
 *
 * Las categorias van en una sola fila que se desliza con el dedo, con cuantos
 * productos tiene cada una, para que ocupe poco en el celular. Con `pegajosa`
 * se queda arriba mientras se baja por la lista.
 */
export function BarraCatalogo({
  categorias,
  total,
  categoria,
  onCategoria,
  busqueda,
  onBusqueda,
  orden,
  onOrden,
  buscador = true,
  placeholder = "Buscar por nombre",
  pegajosa = false,
  className = "",
}: {
  categorias: { nombre: string; cantidad: number }[];
  total: number;
  /** "" es todas. */
  categoria: string;
  onCategoria: (categoria: string) => void;
  busqueda: string;
  onBusqueda: (busqueda: string) => void;
  orden?: OrdenCatalogo;
  /** Sin esta funcion no se muestra el selector de orden. */
  onOrden?: (orden: OrdenCatalogo) => void;
  buscador?: boolean;
  placeholder?: string;
  pegajosa?: boolean;
  className?: string;
}) {
  const conCategorias = categorias.length > 1;
  if (!buscador && !conCategorias && !onOrden) return null;

  const chip = (activa: boolean) =>
    "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
    (activa
      ? "border-brand-600 bg-brand-600 text-white"
      : "border-line bg-surface text-strong hover:border-brand-500");

  return (
    <div
      data-barra-catalogo
      className={
        "space-y-2 " +
        (pegajosa ? "sticky z-20 rounded-2xl border border-line bg-panel p-2 shadow-card " : "") +
        className
      }
    >
      {(buscador || onOrden) && (
        <div className="flex gap-2">
          {buscador && (
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Buscar</span>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                type="search"
                className="input pl-9"
                placeholder={placeholder}
                value={busqueda}
                onChange={(e) => onBusqueda(e.target.value)}
                data-buscar-catalogo
              />
            </label>
          )}
          {onOrden && (
            <label className={buscador ? "w-36 shrink-0 sm:w-48" : "w-full sm:w-56"}>
              <span className="sr-only">Ordenar</span>
              <select
                className="input"
                value={orden ?? "nombre"}
                onChange={(e) => esOrden(e.target.value) && onOrden(e.target.value)}
                data-orden-catalogo
              >
                {ORDENES.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {conCategorias && (
        // contain:inline-size: la fila no pide mas ancho del que hay; si no, en
        // una grilla ensancha toda la pagina en el celular en vez de deslizarse.
        <div
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [contain:inline-size] [scrollbar-width:thin]"
          data-categorias-catalogo
        >
          <button type="button" onClick={() => onCategoria("")} className={chip(categoria === "")} data-categoria="" aria-pressed={categoria === ""}>
            Todo <span className="opacity-70">{total}</span>
          </button>
          {categorias.map((c) => (
            <button
              key={c.nombre}
              type="button"
              onClick={() => onCategoria(categoria === c.nombre ? "" : c.nombre)}
              className={chip(categoria === c.nombre)}
              data-categoria={c.nombre}
              aria-pressed={categoria === c.nombre}
            >
              {c.nombre} <span className="opacity-70">{c.cantidad}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
