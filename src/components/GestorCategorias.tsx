"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  asignarProductosAction,
  borrarCategoriaAction,
  crearCategoriaAction,
  moverCategoriaAction,
  renombrarCategoriaAction,
} from "@/actions/categorias";
import { CATEGORIA_GENERAL, MAX_CATEGORIA, coincideBusqueda } from "@/lib/categorias";
import { Icon } from "./Icon";
import { SubmitButton } from "./SubmitButton";
import { Alert } from "./ui";

export type CategoriaGestor = { id: string; name: string; cantidad: number };
export type ProductoGestor = { id: string; name: string; category: string };

const productosTexto = (n: number) => n + (n === 1 ? " producto" : " productos");

/**
 * Las categorias del negocio a gusto del dueño: crear, cambiar el nombre,
 * ordenar con las flechas, borrar y marcar que productos van en cada una.
 */
export function GestorCategorias({
  categorias,
  productos,
  enGeneral,
}: {
  categorias: CategoriaGestor[];
  productos: ProductoGestor[];
  enGeneral: number;
}) {
  const [state, crear] = useActionState(crearCategoriaAction, undefined);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <div className="space-y-3" data-gestor-categorias>
      <form ref={form} action={crear} className="flex gap-2" data-crear-categoria>
        <input
          className="input min-w-0 flex-1"
          name="name"
          maxLength={MAX_CATEGORIA}
          placeholder="Nueva: Bebidas, Postres, Ofertas..."
          required
        />
        <SubmitButton className="btn-primary btn-sm shrink-0" pendingText="...">
          Crear
        </SubmitButton>
      </form>
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <ul className="space-y-2">
        {categorias.map((c, i) => (
          <FilaCategoria
            key={c.id}
            categoria={c}
            primera={i === 0}
            ultima={i === categorias.length - 1}
            productos={productos}
          />
        ))}
        <li
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line px-3 py-2.5"
          data-fila-categoria={CATEGORIA_GENERAL}
        >
          <span className="text-[13px] font-semibold text-strong">
            {CATEGORIA_GENERAL}
            <span className="ml-1.5 text-xs font-normal text-muted">{productosTexto(enGeneral)}</span>
          </span>
          <span className="text-[11px] text-subtle">Lo que no tiene categoría. Siempre va de última.</span>
        </li>
      </ul>
    </div>
  );
}

function FilaCategoria({
  categoria,
  primera,
  ultima,
  productos,
}: {
  categoria: CategoriaGestor;
  primera: boolean;
  ultima: boolean;
  productos: ProductoGestor[];
}) {
  const [abierto, setAbierto] = useState<"" | "nombre" | "productos">("");
  const [busqueda, setBusqueda] = useState("");
  const [movido, mover] = useActionState(moverCategoriaAction, undefined);
  const [renombrado, renombrar] = useActionState(renombrarCategoriaAction, undefined);
  const [borrado, borrar] = useActionState(borrarCategoriaAction, undefined);
  const [asignado, asignar] = useActionState(asignarProductosAction, undefined);

  // Guardado el nombre o los productos, el panel se cierra solo.
  useEffect(() => {
    if (renombrado?.ok || asignado?.ok) setAbierto("");
  }, [renombrado, asignado]);

  const error = [movido, renombrado, borrado, asignado].map((s) => s?.error).find(Boolean);
  const aviso = abierto === "" ? renombrado?.ok || asignado?.ok : undefined;
  const alternar = (que: "nombre" | "productos") => setAbierto((a) => (a === que ? "" : que));
  const flecha = "btn-ghost btn-sm px-2 disabled:opacity-30";

  return (
    <li className="rounded-xl border border-line bg-surface p-3" data-fila-categoria={categoria.name}>
      {/* Dos filas fijas, no una sola que se envuelve: con "Productos" y
          "Cambiar nombre" compitiendo por espacio en la misma fila que el
          nombre, un nombre largo (o varias categorias con nombres largos)
          hacia que el navegador lo aplastara letra por letra en vez de
          bajarlo de linea. Asi el nombre siempre tiene toda la primera fila
          (solo comparte con las flechas, que son angostas) y los botones
          siempre van en la segunda, envolviendose entre ellos si hace falta. */}
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 gap-1">
          <form action={mover}>
            <input type="hidden" name="id" value={categoria.id} />
            <input type="hidden" name="direccion" value="arriba" />
            <button type="submit" className={flecha} disabled={primera} aria-label={"Subir " + categoria.name}>
              ↑
            </button>
          </form>
          <form action={mover}>
            <input type="hidden" name="id" value={categoria.id} />
            <input type="hidden" name="direccion" value="abajo" />
            <button type="submit" className={flecha} disabled={ultima} aria-label={"Bajar " + categoria.name}>
              ↓
            </button>
          </form>
        </div>

        <p className="min-w-0 flex-1 break-words text-[13px] font-semibold text-strong">
          {categoria.name}
          <span className="ml-1.5 text-xs font-normal text-muted">{productosTexto(categoria.cantidad)}</span>
        </p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => alternar("productos")}
          aria-expanded={abierto === "productos"}
        >
          Productos
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => alternar("nombre")}
          aria-expanded={abierto === "nombre"}
        >
          Cambiar nombre
        </button>
        <form action={borrar}>
          <input type="hidden" name="id" value={categoria.id} />
          <button
            type="submit"
            className="btn-ghost btn-sm px-2 text-bad"
            aria-label={"Borrar categoría " + categoria.name}
            onClick={(e) => {
              const texto =
                "¿Borrar la categoría " +
                categoria.name +
                "?" +
                (categoria.cantidad > 0 ? " Sus " + productosTexto(categoria.cantidad) + " no se borran: pasan a General." : "");
              if (!window.confirm(texto)) e.preventDefault();
            }}
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </form>
      </div>

      {error && (
        <div className="mt-2">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      {aviso && <p className="mt-2 text-xs text-good">{aviso}</p>}

      {abierto === "nombre" && (
        <form action={renombrar} className="mt-3 space-y-1.5">
          <input type="hidden" name="id" value={categoria.id} />
          <div className="flex gap-2">
            <input
              className="input min-w-0 flex-1"
              name="name"
              defaultValue={categoria.name}
              maxLength={MAX_CATEGORIA}
              required
              autoFocus
              data-renombrar
            />
            <SubmitButton className="btn-primary btn-sm shrink-0" pendingText="...">
              Guardar nombre
            </SubmitButton>
          </div>
          <p className="text-[11px] text-subtle">
            Sus productos quedan con el nombre nuevo. Si pones el nombre de otra categoría, se juntan.
          </p>
        </form>
      )}

      {abierto === "productos" && (
        <form action={asignar} className="mt-3 space-y-2 rounded-xl border border-line bg-panel p-3">
          <input type="hidden" name="id" value={categoria.id} />
          <p className="text-xs text-muted">
            Marca lo que va en <b className="text-strong">{categoria.name}</b>. Lo que desmarques pasa a General.
          </p>
          {productos.length > 8 && (
            <input
              type="search"
              className="input"
              placeholder="Buscar producto"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          )}
          {productos.length === 0 ? (
            <p className="text-xs text-subtle">Todavía no tienes productos.</p>
          ) : (
            <ul className="max-h-72 space-y-0.5 overflow-y-auto">
              {productos.map((p) => (
                <li key={p.id} hidden={!coincideBusqueda([p.name, p.category], busqueda)}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface">
                    <input
                      type="checkbox"
                      name="productos"
                      value={p.id}
                      defaultChecked={p.category === categoria.name}
                      aria-label={p.name}
                    />
                    <span className="min-w-0 flex-1 truncate text-strong">{p.name}</span>
                    {p.category !== categoria.name && (
                      <span className="shrink-0 text-[11px] text-subtle">{p.category}</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <SubmitButton className="btn-primary btn-sm" pendingText="Guardando...">
            Guardar productos
          </SubmitButton>
        </form>
      )}
    </li>
  );
}
