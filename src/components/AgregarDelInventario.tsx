"use client";

import { useMemo, useState, useTransition } from "react";
import { addSaleItemsAction } from "@/actions/sales";
import { addDebtItemsAction } from "@/actions/debts";
import { coincideBusqueda } from "@/lib/categorias";
import { money, parseMoney } from "@/lib/format";
import type { ItemPedido } from "@/lib/items-agregados";
import { Alert } from "./ui";
import { Icon } from "./Icon";

export type ProductoParaAgregar = { id: string; name: string; price: number };

type Linea = { key: string; serviceId: string | null; name: string; unitPrice: number; precio: string; qty: number };

/**
 * Agregar mas a una venta o a un fiado ya registrado, escogiendo del
 * inventario como al vender (lo pidio Chopo Snacks). El "Agregar más" de
 * siempre obliga a escribir el nombre y el precio a mano; aqui se toca el
 * producto y el precio sale del catalogo. Lo que no esta en el inventario se
 * puede escribir igual, abajo.
 */
export function AgregarDelInventario({
  tipo,
  id,
  productos,
  currency,
  ceros,
}: {
  tipo: "venta" | "fiado";
  id: string;
  productos: ProductoParaAgregar[];
  currency: string;
  ceros: number;
}) {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [otroNombre, setOtroNombre] = useState("");
  const [otroPrecio, setOtroPrecio] = useState("");
  const [mensaje, setMensaje] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [enviando, startTransition] = useTransition();

  const visibles = useMemo(
    () => productos.filter((p) => coincideBusqueda([p.name], busqueda)),
    [productos, busqueda]
  );
  const total = lineas.reduce((s, l) => s + l.unitPrice * l.qty, 0);

  function agregar(p: ProductoParaAgregar) {
    setMensaje(null);
    setLineas((prev) => {
      const ya = prev.find((l) => l.serviceId === p.id);
      if (ya) return prev.map((l) => (l === ya ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { key: p.id, serviceId: p.id, name: p.name, unitPrice: p.price, precio: "", qty: 1 }];
    });
  }

  function agregarOtro() {
    const precio = parseMoney(otroPrecio, currency, ceros);
    if (!otroNombre.trim() || precio <= 0) {
      setMensaje({ kind: "error", text: "Escribe qué es y su precio." });
      return;
    }
    setMensaje(null);
    setLineas((prev) => [
      ...prev,
      { key: "otro-" + Date.now(), serviceId: null, name: otroNombre.trim(), unitPrice: precio, precio: otroPrecio, qty: 1 },
    ]);
    setOtroNombre("");
    setOtroPrecio("");
  }

  function cambiar(key: string, delta: number) {
    setLineas((prev) =>
      prev.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0)
    );
  }

  function guardar() {
    if (lineas.length === 0 || enviando) return;
    if (!navigator.onLine) {
      setMensaje({ kind: "error", text: "Sin señal: inténtalo cuando vuelva la señal." });
      return;
    }
    const pedidos: ItemPedido[] = lineas.map((l) =>
      l.serviceId ? { serviceId: l.serviceId, qty: l.qty } : { name: l.name, precio: l.precio, qty: l.qty }
    );
    startTransition(async () => {
      try {
        const r = tipo === "venta" ? await addSaleItemsAction(id, pedidos) : await addDebtItemsAction(id, pedidos);
        if (r?.error) {
          setMensaje({ kind: "error", text: r.error });
          return;
        }
        setLineas([]);
        setBusqueda("");
        setMensaje({ kind: "ok", text: r?.ok ?? "Listo." });
      } catch {
        setMensaje({ kind: "error", text: "No se pudo agregar. Revisa la conexión e inténtalo otra vez." });
      }
    });
  }

  return (
    <details className="group mt-2" data-agregar-inventario>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-brand-600">
        <Icon name="plus" className="h-3.5 w-3.5" />
        {tipo === "venta" ? "Agregar más a esta venta" : "Agregar más a este fiado"}
      </summary>

      <div className="mt-2 space-y-2.5 rounded-xl border border-line bg-panel p-2.5">
        {mensaje && <Alert kind={mensaje.kind}>{mensaje.text}</Alert>}

        {productos.length > 8 && (
          <input
            className="input py-1.5 text-sm"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto"
            aria-label="Buscar producto"
          />
        )}

        <div className="grid max-h-60 grid-cols-2 gap-1.5 overflow-y-auto">
          {visibles.map((p) => {
            const llevo = lineas.find((l) => l.serviceId === p.id)?.qty ?? 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => agregar(p)}
                className={
                  "btn-ghost flex-col items-start gap-0 px-2.5 py-2 text-left " +
                  (llevo > 0 ? "border-brand-500 bg-brand-50" : "")
                }
              >
                <span className="block w-full break-words text-xs font-semibold leading-tight text-strong">
                  {p.name}
                  {llevo > 0 && <span className="ml-1 text-brand-700">×{llevo}</span>}
                </span>
                <span className="block text-[11px] text-brand-600">{money(p.price, currency)}</span>
              </button>
            );
          })}
          {visibles.length === 0 && (
            <p className="col-span-2 py-2 text-center text-xs text-subtle">No hay productos con “{busqueda.trim()}”.</p>
          )}
        </div>

        <div className="grid grid-cols-[1fr_88px_auto] gap-1.5">
          <input
            className="input py-1.5 text-xs"
            value={otroNombre}
            onChange={(e) => setOtroNombre(e.target.value)}
            placeholder="Otro (no está en inventario)"
            aria-label="Otro producto"
          />
          <input
            className="input py-1.5 text-xs"
            inputMode="decimal"
            value={otroPrecio}
            onChange={(e) => setOtroPrecio(e.target.value)}
            placeholder="Precio"
            aria-label="Precio del otro producto"
          />
          <button type="button" onClick={agregarOtro} className="btn-ghost btn-sm px-2.5" aria-label="Agregar otro">
            <Icon name="plus" className="h-4 w-4" />
          </button>
        </div>

        {lineas.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface px-2.5">
            {lineas.map((l) => (
              <li key={l.key} className="flex items-center gap-1.5 py-1.5">
                <span className="min-w-0 flex-1 break-words text-xs text-strong">{l.name}</span>
                <button type="button" onClick={() => cambiar(l.key, -1)} className="btn-ghost btn-sm px-2" aria-label="Uno menos">
                  -
                </button>
                <span className="w-6 text-center text-xs font-bold">{l.qty}</span>
                <button type="button" onClick={() => cambiar(l.key, 1)} className="btn-ghost btn-sm px-2" aria-label="Uno más">
                  +
                </button>
                <span className="w-20 text-right text-xs font-semibold text-brand-600">
                  {money(l.unitPrice * l.qty, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={guardar}
          disabled={lineas.length === 0 || enviando}
          className="btn-success btn-sm w-full justify-center"
        >
          <Icon name="check" className="h-4 w-4" />
          {enviando
            ? "Agregando..."
            : lineas.length === 0
              ? "Toca los productos que se agregan"
              : "Agregar " + money(total, currency) + (tipo === "venta" ? " a la venta" : " al fiado")}
        </button>
      </div>
    </details>
  );
}
