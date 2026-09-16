"use client";

import { useMemo, useState } from "react";
import { pedirEnMesaAction } from "@/actions/mesas";
import { agruparPorCategoria, categoriasConCantidad, filtrarCatalogo } from "@/lib/categorias";
import { money } from "@/lib/format";
import { BarraCatalogo } from "./BarraCatalogo";
import { Icon } from "./Icon";

export type ProductoMesa = {
  id: string;
  name: string;
  price: number;
  category: string;
  photo: string | null;
  description: string | null;
};

/**
 * Lo que ve el cliente al escanear el QR de su mesa: el catalogo del negocio,
 * para armar su pedido y mandarlo el mismo a la cocina, sin esperar a que
 * alguien lo atienda para tomarle nota.
 *
 * El pedido no se cobra aqui ni reemplaza al mesero: solo llega a la cuenta de
 * la mesa en el panel, como si el mesero mismo lo hubiera anotado.
 */
export function PedidoMesaForm({
  token,
  mesaNumero,
  items,
  currency,
}: {
  token: string;
  mesaNumero: number;
  items: ProductoMesa[];
  currency: string;
}) {
  const [categoria, setCategoria] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<Record<string, number>>({});
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  const categorias = useMemo(() => categoriasConCantidad(items), [items]);
  const visibles = useMemo(
    () => filtrarCatalogo(items, categoria, busqueda, (i) => [i.name, i.category, i.description]),
    [items, categoria, busqueda]
  );
  const grupos = useMemo(() => agruparPorCategoria(visibles), [visibles]);

  const porId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const lineas = Object.entries(carrito)
    .map(([id, qty]) => ({ item: porId.get(id), qty }))
    .filter((l): l is { item: ProductoMesa; qty: number } => Boolean(l.item) && l.qty > 0);
  const total = lineas.reduce((s, l) => s + l.item.price * l.qty, 0);
  const unidades = lineas.reduce((s, l) => s + l.qty, 0);

  function sumar(id: string, delta: number) {
    setCarrito((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + delta);
      const copia = { ...prev };
      if (next === 0) delete copia[id];
      else copia[id] = next;
      return copia;
    });
  }

  async function enviar() {
    if (unidades === 0) return;
    setEnviando(true);
    setAviso(null);
    try {
      const r = await pedirEnMesaAction(
        token,
        lineas.map((l) => ({ serviceId: l.item.id, qty: l.qty })),
        nota
      );
      if (!r.ok) {
        setAviso({ tono: "error", texto: r.error });
        return;
      }
      setAviso({ tono: "ok", texto: "¡Pedido enviado! Ya le llegó a la cocina." });
      setCarrito({});
      setNota("");
    } catch {
      setAviso({ tono: "error", texto: "No se pudo enviar. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  if (items.length === 0) {
    return (
      <p className="card text-center text-sm text-muted">
        Todavía no hay nada para pedir. Dile al mesero que te atienda.
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      <BarraCatalogo
        categorias={categorias}
        total={items.length}
        categoria={categoria}
        onCategoria={setCategoria}
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholder="Buscar en el menú"
        pegajosa
        className="top-0"
      />

      {visibles.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
          Nada del menú hace juego con “{busqueda || categoria}”.
        </p>
      )}

      <div className="space-y-6">
        {grupos.map((g) => {
          if (g.items.length === 0) return null;
          return (
            <section key={g.nombre}>
              <h2 className="mb-2 text-sm font-bold text-strong">{g.nombre}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {g.items.map((item) => {
                  const qty = carrito[item.id] ?? 0;
                  return (
                    <article key={item.id} className="card flex gap-3 p-3">
                      {item.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.photo} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface">
                          <Icon name="image" className="h-6 w-6 text-subtle" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-strong">{item.name}</p>
                        {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.description}</p>}
                        <p className="mt-1 text-sm font-bold text-brand-600">{money(item.price, currency)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 self-end">
                        {qty > 0 && (
                          <>
                            <button type="button" onClick={() => sumar(item.id, -1)} className="btn-ghost btn-sm px-2" aria-label={"Quitar " + item.name}>
                              −
                            </button>
                            <span className="w-4 text-center text-sm font-bold text-strong">{qty}</span>
                          </>
                        )}
                        <button type="button" onClick={() => sumar(item.id, 1)} className="btn-primary btn-sm px-2" aria-label={"Agregar " + item.name}>
                          <Icon name="plus" className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {unidades > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel p-3 shadow-soft-lg" data-carrito-mesa>
          <div className="mx-auto max-w-lg space-y-2">
            <input
              className="input"
              placeholder="Nota para la cocina (opcional): sin cebolla, poco picante..."
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={200}
            />
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted">
                  {unidades} {unidades === 1 ? "producto" : "productos"} · Mesa {mesaNumero}
                </p>
                <p className="text-base font-bold text-strong">{money(total, currency)}</p>
              </div>
              <button type="button" onClick={enviar} disabled={enviando} className="btn-primary">
                {enviando ? "Enviando..." : "Enviar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}

      {aviso && (
        <div
          className={
            "fixed inset-x-3 bottom-24 z-40 mx-auto max-w-lg rounded-xl border p-3 text-center text-sm font-semibold shadow-soft-lg " +
            (aviso.tono === "ok" ? "border-good-line bg-good-soft text-good" : "border-bad/30 bg-surface text-bad")
          }
          data-aviso-pedido
        >
          {aviso.texto}
        </div>
      )}
    </div>
  );
}
