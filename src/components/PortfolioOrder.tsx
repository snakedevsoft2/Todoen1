"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import { sortTiers, tierPrice, wholesaleTotals, type Tier } from "@/lib/wholesale";
import { Icon } from "./Icon";

/** El apartado de mayoristas del negocio, tal como se publica. */
export type Wholesale = {
  title: string;
  note: string | null;
  tiers: Tier[];
};

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
  wholesale,
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
  /** Promociones por cantidad. Null si el negocio no vende al por mayor. */
  wholesale: Wholesale | null;
}) {
  const [categoria, setCategoria] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [nombre, setNombre] = useState("");
  const [nota, setNota] = useState("");

  const visibles = useMemo(
    () => (categoria ? items.filter((i) => i.category === categoria) : items),
    [items, categoria]
  );

  const tiers = useMemo(() => wholesale?.tiers ?? [], [wholesale]);
  /** La escala mas barata de alcanzar. Es el gancho que se muestra en la ficha. */
  const entrada = tiers.length > 0 ? sortTiers(tiers)[0] : null;

  // Las cuentas del pedido ya con la escala de mayorista que alcanzo.
  const cuentas = useMemo(() => wholesaleTotals(lineas, tiers), [lineas, tiers]);
  const total = cuentas.total;
  const escala = cuentas.tier;

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
    // Mandamos el precio ya con la promocion aplicada: si el negocio ve otra
    // cifra distinta a la que vio el cliente, el descuento se vuelve una pelea.
    const lista = lineas.map((l) => {
      const unidad = escala ? tierPrice(l.precio, escala.percentOff) : l.precio;
      return "- " + l.qty + " x " + l.nombre + (showPrices ? "  " + money(unidad * l.qty, currency) : "");
    });
    const promo = escala
      ? [
          "",
          "Voy al por mayor: " +
            cuentas.units +
            " unidades, " +
            escala.percentOff +
            "% de descuento" +
            (escala.label ? " (" + escala.label + ")" : ""),
        ]
      : [];
    const texto = [
      "Hola " + businessName + ", quiero pedir:",
      "",
      ...lista,
      ...promo,
      ...(showPrices
        ? [
            "",
            ...(escala ? ["Antes: " + money(cuentas.full, currency)] : []),
            "Total aproximado: " + money(total, currency),
          ]
        : []),
      ...(nombre ? ["", "Mi nombre: " + nombre] : []),
      ...(nota ? ["Nota: " + nota] : []),
    ];
    return texto.join("\n");
  }, [lineas, showPrices, currency, businessName, total, nombre, nota, escala, cuentas]);

  const enlacePedido =
    whatsapp && lineas.length > 0
      ? "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent(mensaje)
      : null;

  return (
    <>
      {/* Apartado de mayoristas: quien compra en cantidad ve de una cuanto le
          rebajan y desde cuantas unidades, sin tener que preguntar. */}
      {wholesale && wholesale.tiers.length > 0 && (
        <section
          id="mayoristas"
          className="mb-6 rounded-2xl border border-line bg-brand-50 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-line bg-brand-600 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-white">
              Promocion
            </span>
            <h2 className="font-display text-lg leading-tight text-strong">{wholesale.title}</h2>
          </div>

          <p className="mt-1.5 text-sm text-body">
            Entre mas {itemNoun} lleves, mejor el precio. Se cuentan todas las unidades del pedido,
            asi sean tallas y colores distintos.
          </p>

          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sortTiers(wholesale.tiers).map((t) => {
              const activa = escala?.id === t.id;
              return (
                <li
                  key={t.id}
                  className={
                    "rounded-xl border bg-panel px-3 py-2.5 " +
                    (activa ? "border-brand-500 shadow-focus-brand" : "border-line")
                  }
                >
                  <p className="font-display text-[15px] leading-none text-strong">
                    Desde {t.minQty} {itemNoun}
                  </p>
                  <p className="mt-1.5 font-display text-xl leading-none text-brand-600 num">
                    -{t.percentOff}%
                  </p>
                  <p className="mt-1 text-[11px] text-subtle">
                    {activa ? "Es la que llevas" : t.label ?? "En cada unidad"}
                  </p>
                </li>
              );
            })}
          </ul>

          {wholesale.note && (
            <p className="mt-3 border-t border-line pt-3 text-xs text-muted">{wholesale.note}</p>
          )}
        </section>
      )}

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
                "relative flex items-center justify-center border-b border-line bg-surface " +
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
                <span className="absolute right-2 top-2 rounded-md border border-line bg-bad px-2 py-0.5 text-[11px] font-medium uppercase text-white">
                  Agotado
                </span>
              )}
            </div>

            <div className="flex flex-1 flex-col p-3.5">
              <p className="font-display text-[15px] leading-tight text-strong">{item.name}</p>
              {item.brand && (
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-subtle">
                  {item.brand}
                </p>
              )}
              {item.description && (
                <p className="mt-1 text-xs text-muted">{item.description}</p>
              )}

              {showPrices && (
                <>
                  <p className="mt-2 font-display text-lg leading-none text-brand-600 num">
                    {money(item.price, currency)}
                  </p>
                  {/* La escala de entrada, para que el mayorista vea el precio
                      bueno sin tener que armar el pedido primero. */}
                  {entrada && (
                    <p className="mt-1 text-[11px] font-semibold text-muted">
                      Desde {entrada.minQty}:{" "}
                      <span className="num text-good">
                        {money(tierPrice(item.price, entrada.percentOff), currency)}
                      </span>{" "}
                      c/u
                    </p>
                  )}
                </>
              )}

              {item.variants.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-subtle">
                    Tallas
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => agregar(item, v)}
                        className="rounded-lg border border-line bg-panel px-2.5 py-1 text-xs font-bold text-strong transition hover:bg-brand-50"
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
          <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-panel p-4 shadow-soft-lg">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
              Tu pedido
              {tiers.length > 0 && (
                <span className="ml-1.5 normal-case tracking-normal text-subtle">
                  ({cuentas.units} {cuentas.units === 1 ? "unidad" : "unidades"})
                </span>
              )}
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
                        {money(
                          (escala ? tierPrice(l.precio, escala.percentOff) : l.precio) * l.qty,
                          currency
                        )}
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

            {/* Aviso de mayorista: o ya lo tiene, o le decimos cuanto le falta.
                Lo segundo es lo que de verdad sube el pedido. */}
            {escala && (
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-good-soft px-3 py-2 text-xs font-semibold text-good">
                <Icon name="tag" className="h-4 w-4 shrink-0" />
                <span>
                  Precio al por mayor: {escala.percentOff}% menos
                  {escala.label ? " - " + escala.label : ""}
                </span>
                {showPrices && cuentas.saved > 0 && (
                  <span className="num">Ahorras {money(cuentas.saved, currency)}</span>
                )}
              </p>
            )}

            {cuentas.next && (
              <p
                className={
                  (escala ? "mt-2 " : "mt-3 ") +
                  "flex flex-wrap items-center gap-x-2 rounded-xl border border-line bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800"
                }
              >
                <Icon name="tag" className="h-4 w-4 shrink-0" />
                <span>
                  Agrega {cuentas.missing} {cuentas.missing === 1 ? "unidad" : "unidades"} mas y
                  {escala ? " subes a " : " te llevas "}
                  {cuentas.next.percentOff}% de descuento.
                </span>
              </p>
            )}

            {showPrices && (
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm text-muted">Total aproximado</span>
                <span className="flex items-baseline gap-2">
                  {cuentas.saved > 0 && (
                    <span className="text-sm text-subtle line-through num">
                      {money(cuentas.full, currency)}
                    </span>
                  )}
                  <span className="font-display text-xl text-strong num">
                    {money(total, currency)}
                  </span>
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
              <p className="mt-3 rounded-xl border border-line bg-warn-soft px-3 py-2 text-xs text-warn">
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
