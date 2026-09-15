"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Field } from "./ui";
import { BarraCatalogo } from "./BarraCatalogo";
import { agruparPorCategoria, categoriasConCantidad, filtrarCatalogo } from "@/lib/categorias";
import { money, parseMoney, pasoMoneda } from "@/lib/format";
import { todayIn } from "@/lib/dates";
import { enviar } from "@/lib/cola-reportes";
import {
  borrarVenta,
  cuerpoDeVenta,
  guardarVenta,
  nuevaLlave,
  subirVentas,
  ventasPendientes,
  type VentaPendiente,
} from "@/lib/cola-pendientes";
import { invoiceFileName, invoiceTirilla, type InvoiceData } from "@/lib/invoice";
import { Icon } from "./Icon";
import { RegistrarSW } from "./RegistrarSW";
import { BotonImprimir } from "./BotonImprimir";
import { FacturaAutorizada } from "./FacturaAutorizada";
import type { Pais } from "@/lib/facturacion/paises";

export type VariantOption = {
  id: string;
  label: string;
  stock: number;
  price: number;
};

type ServiceRow = {
  id: string;
  name: string;
  price: number;
  category: string;
  /** Foto de la prenda, cuando la tiene. */
  photo?: string | null;
  /** Tallas con stock propio. Vacio en los negocios que no llevan inventario. */
  variants?: VariantOption[];
};

type StaffRow = { id: string; name: string; color: string };

type CartRow = {
  key: string;
  serviceId: string | null;
  variantId: string | null;
  name: string;
  unitPrice: number;
  qty: number;
  /** Tope de unidades cuando la talla lleva inventario. */
  max?: number;
};

type Mensaje = { kind: "ok" | "error" | "info"; text: string };

/**
 * Registrar una venta, con senal o sin ella.
 *
 * Con senal se manda al momento. Sin senal (o si la red se cae al mandar) la
 * venta queda guardada en el telefono con su llave y se sube sola cuando
 * vuelve, sin quedar repetida. Si el servidor la rechaza al momento (no
 * alcanza el stock, por ejemplo) el carrito se queda como estaba para
 * corregirlo.
 */
export function NewSaleForm({
  ordenCategorias,
  services,
  currency,
  today,
  itemLabel,
  team = [],
  defaultStaffId,
  staffLabel = "Quién atendió",
  timezone,
  cuenta,
  esHoy,
  negocio,
  clientes = [],
  facturacion = null,
  marcaGratis = false,
}: {
  services: ServiceRow[];
  /** El orden de categorias que armo el dueño. */
  ordenCategorias?: string[];
  currency: string;
  today: string;
  itemLabel: string;
  /** Personas entre las que se reparte la venta. Vacio si el negocio no tiene equipo. */
  team?: StaffRow[];
  defaultStaffId?: string;
  staffLabel?: string;
  /** Zona del negocio, para poner la fecha de hoy aunque la pagina venga guardada de otro dia. */
  timezone: string;
  /** Quien esta registrando: su cola de pendientes es solo suya. */
  cuenta: string;
  /** Si la pantalla muestra el dia de hoy (y no uno anterior elegido a proposito). */
  esHoy: boolean;
  /** Los clientes guardados, para escogerlos al escribir el nombre. */
  clientes?: { id: string; name: string; phone: string | null }[];
  /** La factura autorizada, si el negocio la tiene activa. */
  facturacion?: {
    pais: Pais;
    entidad: string;
    predeterminado: "normal" | "autorizada";
    etiquetaImpuesto: string;
  } | null;
  /** Lo que va en el encabezado del recibo impreso. */
  negocio: { nombre: string; telefono: string | null; direccion: string | null; logoUrl: string | null };
  /** La version gratis: el recibo sale con la marca. */
  marcaGratis?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const diaRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [openSizes, setOpenSizes] = useState<string | null>(null);
  const [freeName, setFreeName] = useState("");
  const [freePrice, setFreePrice] = useState("");
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pendientes, setPendientes] = useState<VentaPendiente[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  const telRef = useRef<HTMLInputElement>(null);
  const [pago, setPago] = useState("EFECTIVO");
  const [comprobante, setComprobante] = useState<"normal" | "autorizada">(facturacion?.predeterminado ?? "normal");
  // La venta recien guardada que pidio factura autorizada.
  const [ventaParaFactura, setVentaParaFactura] = useState<string | null>(null);
  /** La ultima venta guardada, para imprimirle el recibo aunque no haya senal. */
  const [ultima, setUltima] = useState<InvoiceData | null>(null);

  const total = useMemo(() => cart.reduce((s, r) => s + r.unitPrice * r.qty, 0), [cart]);

  // Si la pagina se abrio sin senal, puede ser la copia guardada de otro dia:
  // la fecha de hoy se toma del telefono, en la zona del negocio.
  const ponerHoy = useCallback(() => {
    if (esHoy && diaRef.current) diaRef.current.value = todayIn(timezone);
  }, [esHoy, timezone]);
  useEffect(ponerHoy, [ponerHoy]);

  const refrescar = useCallback(async () => {
    try {
      setPendientes(await ventasPendientes(cuenta));
    } catch {
      // Sin IndexedDB no hay cola; el aviso sale al intentar guardar sin senal.
    }
  }, [cuenta]);

  const subir = useCallback(async () => {
    try {
      const r = await subirVentas(cuenta, () => void refrescar());
      await refrescar();
      if (r.enviados > 0) {
        setMensaje({
          kind: "ok",
          text:
            r.enviados === 1
              ? "Volvió la señal: la venta guardada en el teléfono ya se subió."
              : "Volvió la señal: " + r.enviados + " ventas guardadas en el teléfono ya se subieron.",
        });
        router.refresh();
      } else if (r.aviso) {
        setMensaje({ kind: "error", text: r.aviso });
      }
    } catch {
      // Se reintenta en el proximo evento.
    }
  }, [cuenta, refrescar, router]);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    void refrescar().then(() => {
      if (navigator.onLine) void subir();
    });
    const volvio = () => {
      setEnLinea(true);
      void subir();
    };
    const cayo = () => setEnLinea(false);
    const alVolver = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void subir();
    };
    window.addEventListener("online", volvio);
    window.addEventListener("offline", cayo);
    document.addEventListener("visibilitychange", alVolver);
    // Por si el evento "online" no llega (pasa en celulares).
    const reloj = setInterval(() => {
      if (navigator.onLine) void subir();
    }, 30_000);
    return () => {
      window.removeEventListener("online", volvio);
      window.removeEventListener("offline", cayo);
      document.removeEventListener("visibilitychange", alVolver);
      clearInterval(reloj);
    };
  }, [refrescar, subir]);

  // Categoria tocada y busqueda: con muchos productos no hay que bajar por todo.
  const [categoria, setCategoria] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const categorias = useMemo(() => categoriasConCantidad(services, ordenCategorias), [services, ordenCategorias]);
  const grouped = useMemo(
    () =>
      agruparPorCategoria(
        filtrarCatalogo(services, categoria, busqueda, (s) => [s.name, s.category]),
        "nombre",
        ordenCategorias
      ),
    [services, categoria, busqueda, ordenCategorias]
  );

  function addService(service: ServiceRow) {
    // Si la prenda tiene tallas, primero hay que decir cual se vendio.
    if (service.variants && service.variants.length > 0) {
      setOpenSizes(openSizes === service.id ? null : service.id);
      return;
    }
    setCart((prev) => {
      const found = prev.find((r) => r.serviceId === service.id && !r.variantId);
      if (found) {
        return prev.map((r) => (r.key === found.key ? { ...r, qty: r.qty + 1 } : r));
      }
      return [
        ...prev,
        {
          key: service.id,
          serviceId: service.id,
          variantId: null,
          name: service.name,
          unitPrice: service.price,
          qty: 1,
        },
      ];
    });
  }

  function addVariant(service: ServiceRow, variant: VariantOption) {
    if (variant.stock <= 0) return;
    setCart((prev) => {
      const found = prev.find((r) => r.variantId === variant.id);
      if (found) {
        if (found.qty >= variant.stock) return prev;
        return prev.map((r) => (r.key === found.key ? { ...r, qty: r.qty + 1 } : r));
      }
      return [
        ...prev,
        {
          key: variant.id,
          serviceId: service.id,
          variantId: variant.id,
          name: service.name + " - " + variant.label,
          unitPrice: variant.price,
          qty: 1,
          max: variant.stock,
        },
      ];
    });
  }

  function addFree() {
    const price = Math.round(Number(freePrice.replace(/[^\d]/g, "")) || 0);
    if (!freeName.trim() || price <= 0) return;
    setCart((prev) => [
      ...prev,
      {
        key: "free-" + Date.now(),
        serviceId: null,
        variantId: null,
        name: freeName.trim(),
        unitPrice: price,
        qty: 1,
      },
    ]);
    setFreeName("");
    setFreePrice("");
  }

  function bump(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((r) => {
          if (r.key !== key) return r;
          const qty = r.qty + delta;
          // No se puede vender mas de lo que hay en la talla.
          if (r.max !== undefined && qty > r.max) return r;
          return { ...r, qty };
        })
        .filter((r) => r.qty > 0)
    );
  }

  function remove(key: string) {
    setCart((prev) => prev.filter((r) => r.key !== key));
  }

  function limpiar() {
    setCart([]);
    setOpenSizes(null);
    formRef.current?.reset();
    setPago("EFECTIVO");
    ponerHoy();
  }

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    const fd = new FormData(e.currentTarget);
    const manualTotal = String(fd.get("manualTotal") ?? "");
    const valor = cart.length > 0 ? total : parseMoney(manualTotal, currency);
    if (cart.length === 0 && valor <= 0) {
      setMensaje({ kind: "error", text: "Agrega al menos un item o escribe un valor." });
      return;
    }
    const dia = String(fd.get("day") ?? "");
    const aCredito = String(fd.get("paymentMethod") ?? "") === "CREDITO";
    if (aCredito && !String(fd.get("clientName") ?? "").trim()) {
      setMensaje({ kind: "error", text: "Para dejarla en cuentas por cobrar escribe el nombre del cliente." });
      return;
    }

    const venta: VentaPendiente = {
      clientKey: nuevaLlave(),
      cuenta,
      day: /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : todayIn(timezone),
      items: cart.map((r) => ({
        serviceId: r.serviceId,
        variantId: r.variantId,
        name: r.name,
        unitPrice: r.unitPrice,
        qty: r.qty,
      })),
      manualTotal: cart.length > 0 ? "" : manualTotal,
      concept: String(fd.get("concept") ?? ""),
      paymentMethod: String(fd.get("paymentMethod") ?? "EFECTIVO"),
      clientName: String(fd.get("clientName") ?? ""),
      clientPhone: String(fd.get("clientPhone") ?? ""),
      dueDay: aCredito ? String(fd.get("dueDay") ?? "") : "",
      notes: String(fd.get("notes") ?? ""),
      staffId: String(fd.get("staffId") ?? ""),
      total: valor,
      creadoEn: new Date().toISOString(),
      error: null,
    };

    // El recibo sale de lo que se vio en pantalla, no del servidor: asi se puede
    // imprimir tambien sin senal.
    const recibo = (saleId: string, provisional: boolean): InvoiceData => ({
      saleId,
      provisional,
      businessName: negocio.nombre,
      businessPhone: negocio.telefono,
      businessAddress: negocio.direccion,
      logoUrl: negocio.logoUrl,
      currency,
      day: venta.day,
      clientName: venta.clientName.trim() || null,
      paymentMethod: venta.paymentMethod,
      staffName: team.find((t) => t.id === venta.staffId)?.name ?? null,
      items:
        venta.items.length > 0
          ? venta.items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice }))
          : [{ name: venta.concept.trim() || "Venta", qty: 1, unitPrice: valor }],
      total: valor,
      notes: venta.notes.trim() || null,
      marcaGratis,
    });

    setEnviando(true);
    setMensaje(null);
    setUltima(null);
    setVentaParaFactura(null);
    try {
      let aviso = "Sin señal: la venta quedó guardada en este teléfono y se sube sola cuando vuelva.";
      if (navigator.onLine) {
        const p = await enviar("/api/ventas", cuerpoDeVenta(venta));
        if (p.ok) {
          limpiar();
          const id = typeof p.datos.id === "string" ? p.datos.id : venta.clientKey;
          if (p.datos.tipo === "deuda") {
            // A credito no hay factura de venta: queda la deuda del cliente.
            setMensaje({ kind: "ok", text: "Quedó en Cuentas por cobrar a nombre de " + venta.clientName.trim() + "." });
          } else {
            setUltima(recibo(id, false));
            setMensaje({ kind: "ok", text: "Venta registrada." });
            if (facturacion && comprobante === "autorizada") setVentaParaFactura(id);
          }
          router.refresh();
          return;
        }
        if (!p.reintentar) {
          // Rechazada por lo que trae (no alcanza el stock...): el carrito queda para corregirla.
          setMensaje({ kind: "error", text: p.motivo });
          return;
        }
        if (p.conRed) aviso = p.motivo + " La venta quedó guardada en este teléfono.";
      }

      // Sin red, o el servidor no respondio: a la cola, con la misma llave.
      try {
        await guardarVenta(venta);
      } catch {
        setMensaje({ kind: "error", text: "Sin señal y este navegador no deja guardar la venta. Anótala y regístrala cuando vuelva la señal." });
        return;
      }
      limpiar();
      await refrescar();
      if (!aCredito) setUltima(recibo(venta.clientKey, true));
      setMensaje({ kind: "info", text: aviso });
    } finally {
      setEnviando(false);
    }
  }

  async function descartar(clientKey: string) {
    await borrarVenta(clientKey);
    await refrescar();
  }

  return (
    <div className="space-y-4">
      <RegistrarSW guardarEstaPagina />

      {!enLinea && (
        <p data-sin-senal className="rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-[13px] text-warn">
          Sin señal: puedes seguir vendiendo. Las ventas se guardan en este teléfono y se suben solas cuando vuelva. La lista
          del día puede no estar al día.
        </p>
      )}

      {pendientes.length > 0 && (
        <div data-ventas-pendientes className="rounded-xl border border-warn-line bg-warn-soft p-3">
          <p className="flex items-center gap-2 text-[13px] font-bold text-warn">
            <Icon name="clock" className="h-4 w-4" />
            {pendientes.length === 1 ? "1 venta por subir" : pendientes.length + " ventas por subir"} ·{" "}
            {money(
              pendientes.reduce((s, v) => s + v.total, 0),
              currency
            )}
          </p>
          <ul className="mt-2 space-y-1.5">
            {pendientes.map((v) => (
              <li key={v.clientKey} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-strong">
                    {money(v.total, currency)} · {v.items.map((i) => i.qty + "x " + i.name).join(", ") || v.concept || "Venta"}
                  </span>
                  <span className={"block text-[11px] " + (v.error ? "text-bad" : "text-muted")}>
                    {v.error ? "No se pudo subir: " + v.error : !enLinea ? "Esperando señal" : "Subiendo…"}
                  </span>
                </span>
                {v.error && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => descartar(v.clientKey)}>
                    Descartar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mensaje && <Alert kind={mensaje.kind}>{mensaje.text}</Alert>}

      {ventaParaFactura && ultima && facturacion && (
        <FacturaAutorizada
          key={ventaParaFactura}
          saleId={ventaParaFactura}
          pais={facturacion.pais}
          habilitada
          inicial={null}
          base={ultima}
          etiquetaImpuesto={facturacion.etiquetaImpuesto}
          abrirDeUna
        />
      )}

      {ultima && (
        <BotonImprimir
          tirilla={() => invoiceTirilla(ultima)}
          nombreArchivo={invoiceFileName(ultima)}
          logoUrl={ultima.logoUrl}
          label="Imprimir recibo"
          menu="izquierda"
        />
      )}

      {services.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
            Toca para agregar {itemLabel}
          </p>
          <BarraCatalogo
            categorias={categorias}
            total={services.length}
            categoria={categoria}
            onCategoria={setCategoria}
            busqueda={busqueda}
            onBusqueda={setBusqueda}
            buscador={services.length > 8}
            placeholder={"Buscar " + itemLabel}
          />
          {grouped.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-3 text-center text-xs text-muted" data-sin-resultados>
              No hay nada con “{busqueda.trim() || categoria}”.{" "}
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
            </p>
          )}
          {grouped.map(({ nombre: category, items: list }) => (
            <div key={category}>
              <p className="mb-1.5 text-[11px] text-subtle">{category}</p>
              <div className="grid grid-cols-2 gap-2">
                {list.map((s) => {
                  const sizes = s.variants ?? [];
                  const stock = sizes.reduce((sum, v) => sum + Math.max(0, v.stock), 0);
                  const soldOut = sizes.length > 0 && stock <= 0;

                  return (
                    <div key={s.id} className="contents">
                      <button
                        type="button"
                        onClick={() => addService(s)}
                        disabled={soldOut}
                        className={
                          "btn-ghost w-full flex-col items-start gap-0 px-3 py-2.5 text-left " +
                          (soldOut ? "opacity-50" : "") +
                          (openSizes === s.id ? " bg-brand-50" : "")
                        }
                      >
                        <span className="flex w-full items-center gap-2">
                          {s.photo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={s.photo}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-lg border border-line object-cover"
                              loading="lazy"
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            {/* Sin truncar: con foto el espacio es poco y el
                                nombre de la prenda es lo que se busca. */}
                            <span className="block break-words text-xs font-semibold leading-tight text-strong">
                              {s.name}
                            </span>
                            <span className="block text-[11px] text-brand-600">
                              {money(s.price, currency)}
                              {sizes.length > 0 && (
                                <span className={soldOut ? " text-bad" : " text-subtle"}>
                                  {soldOut ? " - agotada" : " - " + stock + " disp."}
                                </span>
                              )}
                            </span>
                          </span>
                        </span>
                      </button>

                      {openSizes === s.id && sizes.length > 0 && (
                        <div className="col-span-2 rounded-xl border border-line bg-brand-50 p-2.5">
                          <p className="mb-1.5 text-[11px] font-semibold text-brand-700">
                            Elige la talla de {s.name}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {sizes.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => addVariant(s, v)}
                                disabled={v.stock <= 0}
                                className={
                                  "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition " +
                                  (v.stock <= 0
                                    ? "cursor-not-allowed border-line bg-surface text-subtle line-through"
                                    : "border-line bg-surface text-strong hover:border-brand-500")
                                }
                              >
                                {v.label}
                                <span className="ml-1 font-normal text-muted">({v.stock})</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
        <input
          className="input"
          placeholder="Otro concepto"
          value={freeName}
          onChange={(e) => setFreeName(e.target.value)}
        />
        <input
          className="input"
          placeholder="Valor"
          inputMode="numeric"
          value={freePrice}
          onChange={(e) => setFreePrice(e.target.value)}
        />
        <button type="button" onClick={addFree} className="btn-ghost">
          <Icon name="plus" className="h-4 w-4" />
          Agregar
        </button>
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        {cart.length === 0 ? (
          <p className="py-3 text-center text-sm text-subtle">
            Todavia no agregas nada a esta venta.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {cart.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-strong">{r.name}</p>
                  <p className="text-xs text-muted">
                    {money(r.unitPrice, currency)} c/u
                    {r.max !== undefined ? " - quedan " + r.max : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => bump(r.key, -1)} className="btn-ghost btn-sm px-2.5">
                    -
                  </button>
                  <span className="w-7 text-center text-sm font-bold">{r.qty}</span>
                  <button
                    type="button"
                    onClick={() => bump(r.key, 1)}
                    disabled={r.max !== undefined && r.qty >= r.max}
                    className="btn-ghost btn-sm px-2.5"
                  >
                    +
                  </button>
                  <span className="w-24 text-right text-sm font-bold text-brand-600">
                    {money(r.unitPrice * r.qty, currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(r.key)}
                    className="btn-ghost btn-sm px-2 text-bad"
                    aria-label="Quitar"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm text-muted">Total de la venta</span>
          <span className="text-xl font-bold text-strong">{money(total, currency)}</span>
        </div>
      </div>

      <form ref={formRef} onSubmit={guardar} className="space-y-3">
        {team.length > 1 && (
          <Field label={staffLabel} hint="La venta se suma a la medicion de esta persona.">
            <select
              className="input"
              name="staffId"
              defaultValue={
                team.some((t) => t.id === defaultStaffId) ? defaultStaffId : team[0]?.id ?? ""
              }
            >
              {team.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Día de la venta">
            <input ref={diaRef} className="input" type="date" name="day" defaultValue={today} />
          </Field>
          <Field label="Método de pago">
            <select className="input" name="paymentMethod" value={pago} onChange={(e) => setPago(e.target.value)}>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="OTRO">Otro</option>
              <option value="CREDITO">Cuentas por cobrar (fiado)</option>
            </select>
          </Field>
          <Field label={pago === "CREDITO" ? "Cliente (quién queda debiendo)" : "Cliente (opcional)"}>
            <input
              className="input"
              name="clientName"
              placeholder="Mostrador"
              list="clientes-guardados"
              autoComplete="off"
              onChange={(e) => {
                // Al escoger un cliente guardado, se trae su telefono.
                const c = clientes.find((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase());
                if (c?.phone && telRef.current && !telRef.current.value) telRef.current.value = c.phone;
              }}
            />
            <datalist id="clientes-guardados">
              {clientes.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.phone ?? ""}
                </option>
              ))}
            </datalist>
          </Field>
          <Field label="Teléfono del cliente (opcional)" hint="Con el nombre queda guardado en Clientes.">
            <input ref={telRef} className="input" name="clientPhone" inputMode="tel" placeholder="300 000 0000" />
          </Field>
          {pago === "CREDITO" && (
            <Field label="¿Cuándo paga? (opcional)" hint="No suma a la caja de hoy: cada abono entra el día en que te paguen.">
              <input className="input" type="date" name="dueDay" />
            </Field>
          )}
        </div>

        {cart.length === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="O registra solo el valor" hint="Util cuando no quieres detallar la venta.">
              <input
                className="input"
                name="manualTotal"
                type="number"
                min={0}
                step={pasoMoneda(currency)}
                placeholder="0"
              />
            </Field>
            <Field label="Concepto">
              <input className="input" name="concept" placeholder="Venta del mostrador" />
            </Field>
          </div>
        )}

        {facturacion && pago !== "CREDITO" && (
          <Field label="Comprobante">
            <select
              className="input"
              name="comprobante"
              value={comprobante}
              onChange={(e) => setComprobante(e.target.value === "autorizada" ? "autorizada" : "normal")}
            >
              <option value="normal">Factura normal</option>
              <option value="autorizada">Factura autorizada ({facturacion.entidad})</option>
            </select>
          </Field>
        )}

        <Field label="Nota (opcional)">
          <input className="input" name="notes" placeholder="Ej: pago mitad efectivo" />
        </Field>

        <button type="submit" className="btn-success w-full" disabled={enviando}>
          <Icon name="check" className="h-4 w-4" />
          {enviando ? "Guardando venta..." : "Guardar venta " + (cart.length > 0 ? "por " + money(total, currency) : "")}
        </button>
      </form>
    </div>
  );
}
