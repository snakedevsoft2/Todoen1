"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import { Icon } from "./Icon";

export type PortfolioItem = {
  id: string;
  name: string;
  price: number;
  category: string;
  photo: string | null;
  description: string | null;
  brand: string | null;
  /** Tallas con stock. Vacio en los negocios que no llevan inventario. */
  variants: { id: string; label: string }[];
  soldOut: boolean;
};

type Linea = { key: string; nombre: string; precio: number; qty: number };

/**
 * Portafolio con pedido.
 *
 * El cliente toca lo que quiere, arma su lista y la manda por WhatsApp ya
 * escrita. No cobramos nada aqui a proposito: el negocio confirma y cobra como
 * siempre lo ha hecho, que es lo que estos negocios realmente necesitan.
 */
export function PortfolioOrder({
  items,
  categories,
  currency,
  whatsapp,
  businessName,
  showPrices,
  itemNoun,
  orderNote,
}: {
  items: PortfolioItem[];
  categories: string[];
  currency: string;
  /** Numero del negocio, solo digitos. Sin el, no hay boton de pedir. */
  whatsapp: string | null;
  businessName: string;
  showPrices: boolean;
  itemNoun: string;
  orderNote: string | null;
}) {
  const [categoria, setCategoria] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [nombre, setNombre] = useState("");
  const [nota, setNota] = useState("");

  const visibles = useMemo(
    () => (categoria ? items.filter((i) => i.category === categoria) : items),
    [items, categoria]
  );

  const total = useMemo(
    () => lineas.reduce((s, l) => s + l.precio * l.qty, 0),
    [lineas]
  );

  function agregar(item: PortfolioItem, variante?: { id: string; label: string }) {
    const key = variante ? variante.id : item.id;
    const nombreLinea = variante ? item.name + " - " + variante.label : item.name;
    setLineas((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { key, nombre: nombreLinea, precio: item.price, qty: 1 }];
    });
  }

  function mover(key: string, delta: number) {
    setLineas((prev) =>
      prev.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0)
    );
  }

  const mensaje = useMemo(() => {
    const lista = lineas.map(
      (l) => "- " + l.qty + " x " + l.nombre + (showPrices ? "  " + money(l.precio * l.qty, currency) : "")
    );
    const texto = [
      "Hola " + businessName + ", quiero pedir:",
      "",
      ...lista,
      ...(showPrices ? ["", "Total aproximado: " + money(total, currency)] : []),
      ...(nombre ? ["", "Mi nombre: " + nombre] : []),
      ...(nota ? ["Nota: " + nota] : []),
    ];
    return texto.join("\n");
  }, [lineas, showPrices, currency, businessName, total, nombre, nota]);

  const enlacePedido =
    whatsapp && lineas.length > 0
      ? "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent(mensaje)
      : null;

  return (
    <>
      {categories.length > 1 && (
        <div className="mb-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => setCategoria("")}
            className={categoria === "" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
          >
            Todo
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoria(c)}
              className={categoria === c ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibles.map((item) => (
          <article key={item.id} className="card flex flex-col overflow-hidden p-0">
            {/* Sin foto la caja se queda baja: un negocio que aun no subio
                fotos no tiene por que verse lleno de huecos enormes. */}
            <div
              className={
                "relative flex items-center justify-center border-b-2 border-edge bg-surface " +
                (item.photo ? "aspect-[4/5]" : "h-16")
              }
            >
              {item.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.photo}
                  alt={item.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <Icon name="image" className="h-6 w-6 text-subtle" />
              )}
              {item.soldOut && (
                <span className="absolute right-2 top-2 rounded-md border-2 border-edge bg-bad px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  Agotado
                </span>
              )}
            </div>

            <div className="flex flex-1 flex-col p-3.5">
              <p className="font-display text-[15px] leading-tight text-strong">{item.name}</p>
              {item.brand && (
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-subtle">
                  {item.brand}
                </p>
              )}
              {item.description && (
                <p className="mt-1 text-xs text-muted">{item.description}</p>
              )}

              {showPrices && (
                <p className="mt-2 font-display text-lg leading-none text-brand-600 num">
                  {money(item.price, currency)}
                </p>
              )}

              {item.variants.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-subtle">
                    Tallas
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => agregar(item, v)}
                        className="rounded-lg border-2 border-edge bg-panel px-2.5 py-1 text-xs font-bold text-strong transition hover:bg-brand-50"
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                !item.soldOut && (
                  <button
                    type="button"
                    onClick={() => agregar(item)}
                    className="btn-ghost btn-sm mt-3 w-full justify-center"
                  >
                    <Icon name="plus" className="h-4 w-4" />
                    Agregar al pedido
                  </button>
                )
              )}
            </div>
          </article>
        ))}
      </div>

      {/* Barra del pedido: se queda abajo mientras el cliente escoge. */}
      {lineas.length > 0 && (
        <div className="sticky bottom-3 z-30 mt-6">
          <div className="mx-auto max-w-2xl rounded-2xl border-2 border-edge bg-panel p-4 shadow-block-lg">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Tu pedido
            </p>

            <ul className="max-h-52 divide-y divide-line overflow-y-auto">
              {lineas.map((l) => (
                <li key={l.key} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-strong">
                    {l.nombre}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => mover(l.key, -1)}
                      className="btn-ghost btn-sm px-2.5"
                      aria-label="Quitar uno"
                    >
                      -
                    </button>
                    <span className="w-6 text-center text-sm font-bold num">{l.qty}</span>
                    <button
                      type="button"
                      onClick={() => mover(l.key, 1)}
                      className="btn-ghost btn-sm px-2.5"
                      aria-label="Agregar uno"
                    >
                      +
                    </button>
                    {showPrices && (
                      <span className="w-24 text-right text-sm font-bold text-brand-600 num">
                        {money(l.precio * l.qty, currency)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                className="input py-2 text-sm"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre (opcional)"
              />
              <input
                className="input py-2 text-sm"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Nota (opcional)"
              />
            </div>

            {showPrices && (
              <div className="mt-3 flex items-center justify-between border-t-2 border-edge pt-3">
                <span className="text-sm text-muted">Total aproximado</span>
                <span className="font-display text-xl text-strong num">
                  {money(total, currency)}
                </span>
              </div>
            )}

            {enlacePedido ? (
              <a
                href={enlacePedido}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-success mt-3 w-full justify-center"
              >
                <Icon name="whatsapp" className="h-5 w-5" />
                Enviar pedido por WhatsApp
              </a>
            ) : (
              <p className="mt-3 rounded-xl border-2 border-edge bg-warn-soft px-3 py-2 text-xs text-warn">
                Este negocio todavia no publico un numero de WhatsApp. Escribele directamente.
              </p>
            )}

            <button
              type="button"
              onClick={() => setLineas([])}
              className="mt-2 w-full text-center text-xs font-semibold text-subtle hover:text-body"
            >
              Vaciar el pedido
            </button>

            {orderNote && <p className="mt-2 text-center text-[11px] text-subtle">{orderNote}</p>}
          </div>
        </div>
      )}

      {lineas.length === 0 && orderNote && (
        <p className="mt-6 text-center text-xs text-subtle">{orderNote}</p>
      )}

      {visibles.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">
          Todavia no hay {itemNoun} publicados en esta categoria.
        </p>
      )}
    </>
  );
}
