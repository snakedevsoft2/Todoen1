"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { Alert, Field } from "./ui";
import { FichaArrastrable } from "./FichaArrastrable";
import { BarraCatalogo } from "./BarraCatalogo";
import { ClienteSelector } from "./ClienteSelector";
import { ordenarEnFilas, type FilaOrden } from "@/lib/orden-productos";
import { agruparPorCategoria, categoriasConCantidad, filtrarCatalogo } from "@/lib/categorias";
import { aCampo, money, parseMoney, pasoMoneda } from "@/lib/format";
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
import { FacturaAutorizada, type EmisorFactura } from "./FacturaAutorizada";
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
/**
 * Cantidad que se puede escribir con el teclado numerico. Mientras se teclea
 * deja el campo vacio sin borrar la linea; al salir vuelve al ultimo valor
 * valido.
 */
function CantidadEditable({ qty, max, onChange }: { qty: number; max?: number; onChange: (qty: number) => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label="Cantidad"
      value={texto ?? String(qty)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const limpio = e.target.value.replace(/\D/g, "").slice(0, 4);
        setTexto(limpio);
        const n = Number(limpio);
        if (n > 0) onChange(max !== undefined ? Math.min(n, max) : n);
      }}
      onBlur={() => setTexto(null)}
      className="input w-12 px-1 py-1 text-center text-sm font-bold"
    />
  );
}

/**
 * El precio de esa linea, editable ahi mismo.
 *
 * Cambia solo esta venta: el precio del catalogo se queda como esta. Sirve
 * para un descuento puntual o un precio negociado, sin tener que ir a
 * Inventario a cambiarlo y volver a cambiarlo despues.
 */
function PrecioEditable({
  price,
  currency,
  onChange,
}: {
  price: number;
  currency: string;
  onChange: (price: number) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label="Precio unitario"
      value={texto ?? aCampo(price, currency)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        setTexto(e.target.value);
        onChange(parseMoney(e.target.value, currency));
      }}
      onBlur={() => setTexto(null)}
      className="input w-20 px-1.5 py-1 text-center text-xs"
    />
  );
}

export function NewSaleForm({
  ordenCategorias,
  filasOrden,
  categoriasVisibles,
  sinValorManual,
  claveOrden,
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
  esDueno = true,
}: {
  services: ServiceRow[];
  /** El orden de categorias que armo el dueño. */
  ordenCategorias?: string[];
  /** Orden a mano de los productos en filas de dos columnas (solo algunos negocios). */
  filasOrden?: FilaOrden[];
  /** Si se da, solo estas categorias salen como botones (y no "Todo"). */
  categoriasVisibles?: string[];
  /** Oculta "O registra solo el valor" y su concepto: solo se vende con productos. */
  sinValorManual?: boolean;
  /** Donde se guarda, en este aparato, el orden que el usuario le da a los productos arrastrando. */
  claveOrden?: string;
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
    emisor: EmisorFactura;
  } | null;
  /** Lo que va en el encabezado del recibo impreso. */
  negocio: { nombre: string; telefono: string | null; direccion: string | null; correo: string | null; logoUrl: string | null };
  /** La version gratis: el recibo sale con la marca. */
  marcaGratis?: boolean;
  /** Si quien vende es el dueño: el empleado solo imprime por Bluetooth. */
  esDueno?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const raizRef = useRef<HTMLDivElement>(null);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [openSizes, setOpenSizes] = useState<string | null>(null);
  const [freeName, setFreeName] = useState("");
  const [freePrice, setFreePrice] = useState("");
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pendientes, setPendientes] = useState<VentaPendiente[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  // Cambia cada vez que se limpia el formulario: al usarlo como key, el
  // selector de cliente vuelve a nacer vacio (su texto y su telefono son
  // estado propio de React, y un reset() nativo no los toca).
  // Lo que se llena de la venta vive aqui para poder editarlo tanto en el
  // formulario como desde la isla, sin bajar.
  const [dia, setDia] = useState(today);
  const [clienteTexto, setClienteTexto] = useState("");
  const [clienteTel, setClienteTel] = useState("");
  const [vence, setVence] = useState("");
  const [pago, setPago] = useState("EFECTIVO");
  const [islaAbierta, setIslaAbierta] = useState(false);
  const [comprobante, setComprobante] = useState<"normal" | "autorizada">(facturacion?.predeterminado ?? "normal");
  // La venta recien guardada que pidio factura autorizada.
  const [ventaParaFactura, setVentaParaFactura] = useState<string | null>(null);
  /** La ultima venta guardada, para imprimirle el recibo aunque no haya senal. */
  const [ultima, setUltima] = useState<InvoiceData | null>(null);

  // Al vender desde la isla el aviso y el boton de imprimir quedan arriba: si
  // esa parte se salio de la pantalla, se sube hasta ahi para que se vea.
  useEffect(() => {
    if (!mensaje) return;
    const raiz = raizRef.current;
    if (raiz && raiz.getBoundingClientRect().top < 0) raiz.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mensaje]);

  // Con el carrito vacio la isla se cierra, para que la proxima venta empiece limpia.
  useEffect(() => {
    if (cart.length === 0) setIslaAbierta(false);
  }, [cart.length]);

  const unidades =cart.reduce((n, r) => n + r.qty, 0);
  const total = useMemo(() => cart.reduce((s, r) => s + r.unitPrice * r.qty, 0), [cart]);

  // El recibo sale de lo que se vio en pantalla, no del servidor: asi se puede
  // imprimir tambien sin senal, tanto la que se acaba de guardar como
  // cualquiera que siga esperando en la cola del telefono.
  const reciboDe = useCallback(
    (venta: VentaPendiente, saleId: string, provisional: boolean, receiptSeq: number | null = null): InvoiceData => ({
      saleId,
      receiptSeq,
      provisional,
      businessName: negocio.nombre,
      businessPhone: negocio.telefono,
      businessAddress: negocio.direccion,
      businessEmail: negocio.correo,
      logoUrl: negocio.logoUrl,
      currency,
      day: venta.day,
      clientName: venta.clientName.trim() || null,
      clientPhone: venta.clientPhone?.trim() || null,
      paymentMethod: venta.paymentMethod,
      staffName: team.find((t) => t.id === venta.staffId)?.name ?? null,
      items:
        venta.items.length > 0
          ? venta.items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice }))
          : [{ name: venta.concept.trim() || "Venta", qty: 1, unitPrice: venta.total }],
      total: venta.total,
      notes: venta.notes.trim() || null,
      marcaGratis,
    }),
    [negocio, currency, team, marcaGratis]
  );

  // Si la pagina se abrio sin senal, puede ser la copia guardada de otro dia:
  // la fecha de hoy se toma del telefono, en la zona del negocio.
  const ponerHoy = useCallback(() => {
    if (esHoy) setDia(todayIn(timezone));
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

  // Orden a mano: por categoria, la lista de ids como el usuario la dejo.
  const [ordenLibre, setOrdenLibre] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!claveOrden) return;
    try {
      const v = JSON.parse(localStorage.getItem(claveOrden) ?? "null");
      if (v && typeof v === "object") setOrdenLibre(v);
    } catch {
      /* sin almacenamiento: queda el orden de siempre */
    }
  }, [claveOrden]);
  function guardarOrden(nuevo: Record<string, string[]>) {
    setOrdenLibre(nuevo);
    if (!claveOrden) return;
    try {
      if (Object.keys(nuevo).length === 0) localStorage.removeItem(claveOrden);
      else localStorage.setItem(claveOrden, JSON.stringify(nuevo));
    } catch {
      /* no se pudo guardar; sigue valiendo mientras la pagina este abierta */
    }
  }
  /**
   * Como se agarra un producto para moverlo.
   *
   * Con mouse basta arrastrar 8 pixeles. Con el dedo hay que mantenerlo 250ms
   * antes de mover, para no chocar con el desplazamiento de la pagina: un
   * toque rapido sigue agregando el producto, como siempre.
   *
   * `tolerance` es cuanto se le permite temblar al dedo DURANTE esa espera. En
   * 8 pixeles se cancelaba casi siempre -sosteniendo el telefono con una mano
   * es imposible no moverse un poco- y en vez de agarrar el producto la
   * pagina se desplazaba, que es justo lo que hacia parecer que esto no
   * servia. 16 deja margen para el pulso sin confundirse con un deslizamiento,
   * porque un deslizamiento para desplazar dura mucho menos que 250ms.
   */
  const sensoresOrden = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 16 } })
  );
  const puedeMover = !!claveOrden && !busqueda.trim();

  /** Los productos de una categoria en el orden que se ve (el guardado manda sobre el fijo). */
  function enOrden(category: string, list: ServiceRow[]): (ServiceRow | null)[] {
    const guardado = ordenLibre[category];
    if (guardado && puedeMover) {
      const lugar = new Map(guardado.map((id, i) => [id, i]));
      return [...list].sort((a, b) => (lugar.get(a.id) ?? 1e9) - (lugar.get(b.id) ?? 1e9));
    }
    return filasOrden ? ordenarEnFilas(list, filasOrden, false) : list;
  }
  function alSoltar(category: string, ids: string[], e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const de = ids.indexOf(String(active.id));
    const a = ids.indexOf(String(over.id));
    if (de < 0 || a < 0) return;
    guardarOrden({ ...ordenLibre, [category]: arrayMove(ids, de, a) });
  }

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

  function setQty(key: string, qty: number) {
    setCart((prev) =>
      prev.map((r) => (r.key === key ? { ...r, qty: r.max !== undefined ? Math.min(qty, r.max) : qty } : r))
    );
  }

  function setUnitPrice(key: string, unitPrice: number) {
    setCart((prev) => prev.map((r) => (r.key === key ? { ...r, unitPrice: Math.max(0, unitPrice) } : r)));
  }

  /**
   * El boton de la isla: vende con lo que ya esta puesto en el formulario (pago,
   * quien atendio...) sin bajar. Si falta algo que no se puede adivinar, el
   * nombre del cliente en un fiado, lleva hasta el formulario en vez de fallar.
   */
  function venderDesdeIsla() {
    const form = formRef.current;
    if (!form || enviando) return;
    const fd = new FormData(form);
    if (String(fd.get("paymentMethod") ?? "") === "CREDITO" && !String(fd.get("clientName") ?? "").trim()) {
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      setMensaje({ kind: "error", text: "Para dejarla en cuentas por cobrar escribe el nombre del cliente." });
      return;
    }
    setIslaAbierta(false);
    form.requestSubmit();
  }

  function remove(key: string) {
    setCart((prev) => prev.filter((r) => r.key !== key));
  }

  function limpiar() {
    setCart([]);
    setOpenSizes(null);
    formRef.current?.reset();
    setPago("EFECTIVO");
    setClienteTexto("");
    setClienteTel("");
    setVence("");
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

    setEnviando(true);
    setMensaje(null);
    setUltima(null);
    setVentaParaFactura(null);
    try {
      let aviso = "Sin señal: la venta quedó guardada en este teléfono. Ya puedes imprimir su recibo abajo, y se sube sola cuando vuelva la señal.";
      if (navigator.onLine) {
        const p = await enviar("/api/ventas", cuerpoDeVenta(venta));
        if (p.ok) {
          limpiar();
          const id = typeof p.datos.id === "string" ? p.datos.id : venta.clientKey;
          const receiptSeq = typeof p.datos.receiptSeq === "number" ? p.datos.receiptSeq : null;
          if (p.datos.tipo === "deuda") {
            // A credito no hay factura de venta: queda la deuda del cliente,
            // pero si se le puede entregar el recibo del fiado.
            setUltima(reciboDe(venta, id, false, receiptSeq));
            setMensaje({ kind: "ok", text: "Quedó en Cuentas por cobrar a nombre de " + venta.clientName.trim() + "." });
          } else {
            setUltima(reciboDe(venta, id, false, receiptSeq));
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
        if (p.conRed) aviso = p.motivo + " La venta quedó guardada en este teléfono, con su recibo listo para imprimir.";
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
      setUltima(reciboDe(venta, venta.clientKey, true));
      setMensaje({ kind: "info", text: aviso });
    } finally {
      setEnviando(false);
    }
  }

  async function descartar(clientKey: string) {
    await borrarVenta(clientKey);
    await refrescar();
  }

  // Dia, pago, cliente y telefono. Se pinta dos veces (formulario e isla): la
  // copia de la isla no lleva `name`, asi que solo la del formulario se envia.
  const camposVenta = (enForm: boolean) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Día de la venta">
        <input
          className="input"
          type="date"
          name={enForm ? "day" : undefined}
          value={dia}
          onChange={(e) => setDia(e.target.value)}
        />
      </Field>
      <Field label="Método de pago">
        <select
          className="input"
          name={enForm ? "paymentMethod" : undefined}
          value={pago}
          onChange={(e) => setPago(e.target.value)}
        >
          <option value="EFECTIVO">Efectivo</option>
          <option value="TARJETA">Tarjeta</option>
          <option value="TRANSFERENCIA">Transferencia</option>
          <option value="OTRO">Otro</option>
          <option value="CREDITO">Cuentas por cobrar (fiado)</option>
        </select>
      </Field>
      <ClienteSelector
        clientes={clientes}
        nameLabel={pago === "CREDITO" ? "Cliente (quién queda debiendo)" : "Cliente (opcional)"}
        phoneHint={enForm ? "Con el nombre queda guardado en Clientes." : undefined}
        nameFieldName={enForm ? "clientName" : ""}
        phoneFieldName={enForm ? "clientPhone" : ""}
        texto={clienteTexto}
        telefono={clienteTel}
        onTexto={setClienteTexto}
        onTelefono={setClienteTel}
      />
      {pago === "CREDITO" && (
        <Field label="¿Cuándo paga? (opcional)" hint="No suma a la caja de hoy: cada abono entra el día en que te paguen.">
          <input
            className="input"
            type="date"
            name={enForm ? "dueDay" : undefined}
            value={vence}
            onChange={(e) => setVence(e.target.value)}
          />
        </Field>
      )}
    </div>
  );

  // Las mismas lineas se ven en la lista de abajo y en la isla de arriba.
  const lineasCarrito = (
    <ul className="divide-y divide-line">
      {cart.map((r) => (
        <li key={r.key} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-2">
          <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
            <p className="break-words text-sm font-medium text-strong">{r.name}</p>
            <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
              <PrecioEditable price={r.unitPrice} currency={currency} onChange={(price) => setUnitPrice(r.key, price)} />
              c/u
              {r.max !== undefined ? " - quedan " + r.max : ""}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => bump(r.key, -1)} className="btn-ghost btn-sm px-2.5">
              -
            </button>
            <CantidadEditable qty={r.qty} max={r.max} onChange={(qty) => setQty(r.key, qty)} />
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
  );

  return (
    <div ref={raizRef} className="space-y-4">
      <RegistrarSW guardarEstaPagina />

      {cart.length > 0 && (
        <div data-isla-venta className="pointer-events-none sticky top-[4.25rem] z-20 flex justify-end lg:top-3">
          <div className="pointer-events-auto relative w-full max-w-sm">
            <button
              type="button"
              onClick={() => setIslaAbierta((v) => !v)}
              aria-expanded={islaAbierta}
              className="ml-auto flex items-center gap-2 rounded-full border border-line bg-panel py-1.5 pl-3 pr-3.5 shadow-lg"
            >
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand-600 px-1.5 text-[12px] font-bold text-white">
                {unidades}
              </span>
              <span className="text-[11px] text-muted">{unidades === 1 ? "unidad" : "unidades"}</span>
              <span className="text-sm font-bold text-strong">{money(total, currency)}</span>
              <span aria-hidden="true" className="text-[10px] text-muted">
                {islaAbierta ? "▴" : "▾"}
              </span>
            </button>

            {islaAbierta && (
              <div className="mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-panel p-3 shadow-lg">
                {lineasCarrito}
                <div className="mt-3 border-t border-line pt-3">{camposVenta(false)}</div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                  <div>
                    <p className="text-[11px] text-muted">Total de la venta</p>
                    <p className="text-xl font-bold leading-tight text-strong">{money(total, currency)}</p>
                  </div>
                  <button type="button" onClick={venderDesdeIsla} disabled={enviando} className="btn-success">
                    <Icon name="check" className="h-4 w-4" />
                    {enviando ? "Guardando..." : pago === "CREDITO" ? "Fiar" : "Vender"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!enLinea && (
        <p data-sin-senal className="rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-[13px] text-warn">
          Sin señal: puedes seguir vendiendo e imprimiendo. Cada venta se guarda en este teléfono con su recibo listo
          para imprimir, y se suben solas cuando vuelva la señal. La lista del día puede no estar al día.
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
          <p className="mt-0.5 text-[11px] text-warn/80">
            Cada una trae su botón para imprimir el recibo, aunque siga sin señal.
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
                {(
                  <BotonImprimir
                    tirilla={() => invoiceTirilla(reciboDe(v, v.clientKey, true))}
                    nombreArchivo={invoiceFileName(reciboDe(v, v.clientKey, true))}
                    logoUrl={negocio.logoUrl}
                    label="Imprimir"
                    className="btn-ghost btn-sm"
                    menu="izquierda"
                    soloBluetooth={!esDueno}
                  />
                )}
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
          emisor={facturacion.emisor}
          abrirDeUna
          soloBluetooth={!esDueno}
        />
      )}

      {ultima && (
        <BotonImprimir
          tirilla={() => invoiceTirilla(ultima)}
          nombreArchivo={invoiceFileName(ultima)}
          logoUrl={ultima.logoUrl}
          label="Imprimir recibo"
          menu="izquierda"
          soloBluetooth={!esDueno}
        />
      )}

      {services.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
            Toca para agregar {itemLabel}
          </p>
          <BarraCatalogo
            categorias={categoriasVisibles ? categorias.filter((c) => categoriasVisibles.includes(c.nombre)) : categorias}
            sinTodo={!!categoriasVisibles}
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
          {/* Arriba y no al final: enterrada debajo de cuarenta productos no la
              leia nadie, y sin leerla el gesto no se adivina. */}
          {puedeMover && grouped.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-subtle">
              <Icon name="grip" className="h-3.5 w-3.5 shrink-0" />
              Para acomodarlos a tu gusto: deja el dedo sobre un producto un momento y arrástralo.
            </p>
          )}
          {grouped.map(({ nombre: category, items: list }) => (
            <div key={category}>
              <p className="mb-1.5 text-[11px] text-subtle">{category}</p>
              <DndContext
                sensors={sensoresOrden}
                collisionDetection={closestCenter}
                onDragEnd={(e) =>
                  alSoltar(
                    category,
                    enOrden(category, list).flatMap((x) => (x ? [x.id] : [])),
                    e
                  )
                }
              >
              <SortableContext
                items={enOrden(category, list).flatMap((x) => (x ? [x.id] : []))}
                strategy={rectSortingStrategy}
              >
              <div className="grid grid-cols-2 gap-2">
                {enOrden(category, list).map((s, lugar) => {
                  // Casilla vacia de la lista: mantiene al siguiente en su columna.
                  if (!s) return <div key={"hueco-" + lugar} aria-hidden="true" />;
                  const sizes = s.variants ?? [];
                  const stock = sizes.reduce((sum, v) => sum + Math.max(0, v.stock), 0);
                  const soldOut = sizes.length > 0 && stock <= 0;
                  // Cuantas van de este producto (sumando todas sus tallas).
                  const llevo = cart.reduce((n, r) => (r.serviceId === s.id ? n + r.qty : n), 0);

                  return (
                    <div key={s.id} className="contents">
                      <FichaArrastrable id={s.id} activa={puedeMover}>
                      <button
                        type="button"
                        onClick={() => addService(s)}
                        disabled={soldOut}
                        className={
                          "btn-ghost w-full flex-col items-start gap-0 px-3 py-2.5 text-left " +
                          (soldOut ? "opacity-50" : "") +
                          (openSizes === s.id ? " bg-brand-50" : "") +
                          (llevo > 0 ? " border-brand-500 bg-brand-50" : "")
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
                            {llevo > 0 && (
                              <span className="block text-[11px] font-semibold text-brand-700">
                                Llevas {llevo}
                              </span>
                            )}
                          </span>
                          {llevo > 0 && (
                            <span
                              data-llevo
                              aria-label={llevo + " en la venta"}
                              className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-brand-600 px-1.5 text-[12px] font-bold text-white"
                            >
                              {llevo}
                            </span>
                          )}
                        </span>
                      </button>
                      </FichaArrastrable>

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
              </SortableContext>
              </DndContext>
              {puedeMover && ordenLibre[category] && (
                <button
                  type="button"
                  className="link mt-1.5 text-[11px]"
                  onClick={() => {
                    const { [category]: _quitar, ...resto } = ordenLibre;
                    guardarOrden(resto);
                  }}
                >
                  Volver al orden de siempre
                </button>
              )}
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
          lineasCarrito
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

        {camposVenta(true)}

        {cart.length === 0 && !sinValorManual && (
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
