"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import { sortTiers, tierPrice, wholesaleTotals, type Tier } from "@/lib/wholesale";
import type { PlantillaKey } from "@/lib/plantillas";
import { Icon } from "./Icon";
import { BarraCatalogo } from "./BarraCatalogo";
import { Visor360 } from "./Visor360";
import {
  agruparPorCategoria,
  categoriasConCantidad,
  filtrarCatalogo,
  ordenarItems,
  type OrdenCatalogo,
} from "@/lib/categorias";

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
  /** Fotos en orden para girar el producto (frente, derecha, atras, izquierda). */
  giro?: string[];
  description: string | null;
  brand: string | null;
  /** Tallas con stock. Vacio en los negocios que no llevan inventario. */
  variants: { id: string; label: string }[];
  soldOut: boolean;
  /** Para ordenar por los mas nuevos (milisegundos). */
  createdAt?: number;
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
  ordenCategorias,
  deliveryEnabled,
  deliveryFee,
  codPayment,
  onlinePayment,
  template,
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
  /** El orden de categorias que armo el dueño. */
  ordenCategorias?: string[];
  /** Si el negocio hace domicilios y cuanto cobra por eso. */
  deliveryEnabled: boolean;
  deliveryFee: number;
  /** Formas de pago que el negocio ofrece en el pedido publico. */
  codPayment: boolean;
  onlinePayment: boolean;
  /** Plantilla de diseño elegida (lib/plantillas.ts). */
  template: PlantillaKey;
}) {
  const [categoria, setCategoria] = useState("");
  const [girando, setGirando] = useState<PortfolioItem | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [nombre, setNombre] = useState("");
  const [nota, setNota] = useState("");
  // Modal de cantidad: se abre al tocar "Agregar al pedido" o una talla, y solo
  // ahi se suma a la lista. Asi el cliente elige cuantas quiere de una vez, en
  // vez de tocar el boton varias veces seguidas.
  const [agregando, setAgregando] = useState<{
    item: PortfolioItem;
    variante?: { id: string; label: string };
  } | null>(null);
  const [modalQty, setModalQty] = useState(1);
  // Si el negocio solo ofrece una forma de pago no hay nada que elegir, pero
  // igual queda fija para que el mensaje de WhatsApp diga cual es.
  const [metodoPago, setMetodoPago] = useState<"cod" | "online">(
    onlinePayment && !codPayment ? "online" : "cod"
  );

  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<OrdenCatalogo>("nombre");

  const conteo = useMemo(() => categoriasConCantidad(items, ordenCategorias), [items, ordenCategorias]);
  const visibles = useMemo(
    () =>
      ordenarItems(
        filtrarCatalogo(items, categoria, busqueda, (i) => [i.name, i.brand, i.description, i.category]),
        orden
      ),
    [items, categoria, busqueda, orden]
  );
  // Viendo todo, cada categoria con su titulo: se entiende que hay y donde.
  const grupos = useMemo(
    () => (categoria === "" && busqueda.trim() === "" && categories.length > 1 ? agruparPorCategoria(visibles, orden, ordenCategorias) : null),
    [visibles, categoria, busqueda, orden, categories.length, ordenCategorias]
  );

  const tiers = useMemo(() => wholesale?.tiers ?? [], [wholesale]);
  /** La escala mas barata de alcanzar. Es el gancho que se muestra en la ficha. */
  const entrada = tiers.length > 0 ? sortTiers(tiers)[0] : null;

  // Las cuentas del pedido ya con la escala de mayorista que alcanzo.
  const cuentas = useMemo(() => wholesaleTotals(lineas, tiers), [lineas, tiers]);
  const total = cuentas.total;
  const escala = cuentas.tier;

  // Con las dos formas de pago encendidas el cliente elige; con una sola no
  // hay nada que elegir, pero el mensaje igual necesita saber cual es.
  const metodoEfectivo: "cod" | "online" =
    codPayment && onlinePayment ? metodoPago : codPayment ? "cod" : "online";
  const totalConDomicilio = total + (deliveryEnabled ? deliveryFee : 0);

  function agregar(item: PortfolioItem, variante?: { id: string; label: string }, qty = 1) {
    const key = variante ? variante.id : item.id;
    const nombreLinea = variante ? item.name + " - " + variante.label : item.name;
    setLineas((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l));
      return [...prev, { key, nombre: nombreLinea, precio: item.price, qty }];
    });
  }

  function mover(key: string, delta: number) {
    setLineas((prev) =>
      prev.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0)
    );
  }

  function abrirAgregar(item: PortfolioItem, variante?: { id: string; label: string }) {
    setAgregando({ item, variante });
    setModalQty(1);
  }

  function confirmarAgregar() {
    if (!agregando) return;
    agregar(agregando.item, agregando.variante, modalQty);
    setAgregando(null);
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
            ...(deliveryEnabled
              ? [
                  "Subtotal: " + money(total, currency),
                  "Domicilio: " + money(deliveryFee, currency),
                  "Total con domicilio: " + money(totalConDomicilio, currency),
                ]
              : ["Total aproximado: " + money(total, currency)]),
          ]
        : []),
      ...(codPayment || onlinePayment
        ? ["Forma de pago: " + (metodoEfectivo === "cod" ? "contra entrega" : "en línea")]
        : []),
      ...(nombre ? ["", "Mi nombre: " + nombre] : []),
      ...(nota ? ["Nota: " + nota] : []),
    ];
    return texto.join("\n");
  }, [
    lineas,
    showPrices,
    currency,
    businessName,
    total,
    totalConDomicilio,
    deliveryEnabled,
    deliveryFee,
    codPayment,
    onlinePayment,
    metodoEfectivo,
    nombre,
    nota,
    escala,
    cuentas,
  ]);

  const enlacePedido =
    whatsapp && lineas.length > 0
      ? "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent(mensaje)
      : null;

  const ficha = (item: PortfolioItem) => (
        <article
          key={item.id}
          className="card ficha-tarjeta group flex flex-col overflow-hidden rounded-3xl p-0 transition duration-300 ease-out hover:-translate-y-1 hover:shadow-soft-lg"
        >
          {/* Sin foto la caja se queda baja: un negocio que aun no subio
              fotos no tiene por que verse lleno de huecos enormes. */}
          <div
            className={
              "ficha-imagen relative flex items-center justify-center overflow-hidden border-b border-line bg-surface " +
              (item.photo ? "aspect-[4/5]" : "h-16")
            }
          >
            {item.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.photo}
                alt={item.name}
                className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.06]"
                loading="lazy"
              />
            ) : (
              <Icon name="image" className="h-6 w-6 text-subtle" />
            )}
            {item.giro && (
              <button
                type="button"
                onClick={() => setGirando(item)}
                className="absolute bottom-2 left-2 rounded-full border border-line bg-panel/90 px-2.5 py-1 text-[11px] font-semibold text-strong shadow-soft"
              >
                Ver 360°
              </button>
            )}
            {item.soldOut && (
              <span className="absolute right-2 top-2 rounded-md border border-line bg-bad px-2 py-0.5 text-[11px] font-medium uppercase text-white">
                Agotado
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col p-4">
            <p className="font-display text-[16px] leading-tight text-strong">{item.name}</p>
            {template !== "industrial" && item.brand && (
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-subtle">
                {item.brand}
              </p>
            )}
            {item.description && (
              <p className="mt-1 text-xs text-muted">{item.description}</p>
            )}

            {showPrices && (
              <>
                <p className="ficha-precio mt-2.5 inline-flex w-fit items-center rounded-full bg-brand-50 px-2.5 py-1 font-display text-base leading-none text-brand-700 num">
                  {money(item.price, currency)}
                </p>
                {/* La escala de entrada, para que el mayorista vea el precio
                    bueno sin tener que armar el pedido primero. */}
                {entrada && (
                  <p className="mt-1.5 text-[11px] font-semibold text-muted">
                    Desde {entrada.minQty}:{" "}
                    <span className="num text-good">
                      {money(tierPrice(item.price, entrada.percentOff), currency)}
                    </span>{" "}
                    c/u
                  </p>
                )}
              </>
            )}

            {/* Solo en la plantilla industrial: la marca se lee como fila de
                specs ("Modelo"), como en un catalogo tecnico, en vez de la
                etiqueta suelta de las demas plantillas. Las tallas siguen
                abajo como chips: ahi es donde de verdad se eligen. */}
            {template === "industrial" && item.brand && (
              <div className="ficha-specs">
                <p className="ficha-specs-fila">
                  <span className="flex items-center gap-1.5">
                    <Icon name="box" className="h-3.5 w-3.5" />
                    Modelo
                  </span>
                  <span className="font-semibold text-body">{item.brand}</span>
                </p>
              </div>
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
                      onClick={() => abrirAgregar(item, v)}
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
                  onClick={() => abrirAgregar(item)}
                  className="btn-ghost btn-sm mt-3 w-full justify-center"
                >
                  <Icon name="plus" className="h-4 w-4" />
                  Agregar al pedido
                </button>
              )
            )}
          </div>
        </article>
  );

  return (
    <>
      {girando?.giro && <Visor360 nombre={girando.name} fotos={girando.giro} onCerrar={() => setGirando(null)} />}

      {/* Modal de cantidad: se abre al tocar "Agregar al pedido" o una talla.
          Bottom-sheet en celular, tarjeta centrada en escritorio. */}
      {agregando && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-strong/40 backdrop-blur-sm sm:items-center"
          onClick={() => setAgregando(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl border border-line bg-panel p-5 shadow-soft-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface">
                {agregando.item.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={agregando.item.photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="image" className="h-5 w-5 text-subtle" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-base text-strong">
                  {agregando.variante
                    ? agregando.item.name + " - " + agregando.variante.label
                    : agregando.item.name}
                </p>
                {showPrices && (
                  <p className="font-display text-brand-600 num">
                    {money(agregando.item.price, currency)}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                className="btn-ghost h-11 w-11 rounded-full !p-0 text-lg"
                aria-label="Quitar uno"
              >
                -
              </button>
              <span className="w-10 text-center font-display text-2xl num">{modalQty}</span>
              <button
                type="button"
                onClick={() => setModalQty((q) => q + 1)}
                className="btn-ghost h-11 w-11 rounded-full !p-0 text-lg"
                aria-label="Agregar uno"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={confirmarAgregar}
              className="btn-primary mt-5 w-full justify-center"
            >
              <Icon name="plus" className="h-4 w-4" />
              {"Agregar " +
                modalQty +
                (showPrices ? " · " + money(agregando.item.price * modalQty, currency) : "")}
            </button>

            <button
              type="button"
              onClick={() => setAgregando(null)}
              className="mt-2 w-full text-center text-xs font-semibold text-subtle hover:text-body"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
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

      <BarraCatalogo
        categorias={conteo}
        total={items.length}
        categoria={categoria}
        onCategoria={setCategoria}
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        buscador={items.length > 6}
        orden={orden}
        onOrden={showPrices && items.length > 3 ? setOrden : undefined}
        placeholder={"Buscar " + itemNoun}
        pegajosa={items.length > 6}
        className="top-3 mb-5"
      />

      {visibles.length === 0 && (
        <div className="card mb-5 text-center text-[13px] text-muted" data-sin-resultados>
          No encontramos “{busqueda.trim() || categoria}”.{" "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setBusqueda("");
              setCategoria("");
            }}
          >
            Ver todo
          </button>
        </div>
      )}

      {grupos ? (
        <div className="space-y-8">
          {grupos.map((g) => (
            <section key={g.nombre} data-grupo-categoria={g.nombre}>
              <h2 className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-sm font-semibold text-strong">
                {g.nombre}
                <span className="text-xs font-medium text-muted">{g.items.length}</span>
              </h2>
              <div className="grid animate-lista gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.items.map((item) => ficha(item))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid animate-lista gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibles.map((item) => ficha(item))}
        </div>
      )}

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

            {deliveryEnabled && (
              <p className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-body">
                <span className="flex items-center gap-1.5">
                  <Icon name="truck" className="h-4 w-4 text-subtle" />
                  Domicilio
                </span>
                {showPrices && <span className="num">{money(deliveryFee, currency)}</span>}
              </p>
            )}

            {(codPayment || onlinePayment) && (
              <div className={deliveryEnabled ? "mt-2" : "mt-3"}>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
                  Forma de pago
                </p>
                {codPayment && onlinePayment ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMetodoPago("cod")}
                      className={
                        "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition " +
                        (metodoPago === "cod"
                          ? "border-brand-500 bg-brand-50 text-brand-700 shadow-focus-brand"
                          : "border-line bg-panel text-body hover:border-line-strong")
                      }
                    >
                      <Icon name="truck" className="h-4 w-4" />
                      Contra entrega
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPago("online")}
                      className={
                        "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition " +
                        (metodoPago === "online"
                          ? "border-brand-500 bg-brand-50 text-brand-700 shadow-focus-brand"
                          : "border-line bg-panel text-body hover:border-line-strong")
                      }
                    >
                      <Icon name="card" className="h-4 w-4" />
                      Pago en línea
                    </button>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-body">
                    <Icon name={codPayment ? "truck" : "card"} className="h-4 w-4 text-subtle" />
                    {codPayment ? "Contra entrega" : "Pago en línea"}
                  </p>
                )}
              </div>
            )}

            {showPrices && (
              <div className="mt-3 border-t border-line pt-3">
                {deliveryEnabled && (
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Subtotal</span>
                    <span className="num">{money(total, currency)}</span>
                  </div>
                )}
                <div className={"flex items-center justify-between " + (deliveryEnabled ? "mt-1" : "")}>
                  <span className="text-sm text-muted">
                    {deliveryEnabled ? "Total con domicilio" : "Total aproximado"}
                  </span>
                  <span className="flex items-baseline gap-2">
                    {cuentas.saved > 0 && (
                      <span className="text-sm text-subtle line-through num">
                        {money(cuentas.full, currency)}
                      </span>
                    )}
                    <span className="font-display text-xl text-strong num">
                      {money(totalConDomicilio, currency)}
                    </span>
                  </span>
                </div>
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
