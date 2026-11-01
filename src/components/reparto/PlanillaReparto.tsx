"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import {
  anularPlanillaAction,
  borrarPlanillaAction,
  cerrarPlanillaAction,
  guardarPlanillaAction,
  reabrirPlanillaAction,
  type PlanillaPedida,
} from "@/actions/reparto";
import {
  CATEGORIAS_PAGO,
  aCentavos,
  calcularCuadre,
  categoriaDePago,
  claveDe,
  evaluarSuma,
  totalLineaDe,
  type Semaforo,
} from "@/lib/reparto";
import { money } from "@/lib/format";
import { Alert, Field } from "../ui";
import { Icon } from "../Icon";
import { SubmitButton } from "../SubmitButton";
import { BotonBorrar } from "../BotonBorrar";

type Producto = { id: string; code: string; name: string; precioDia: number };
type Linea = {
  productoId: string;
  carga: string;
  devolucion: string;
  precio: string;
  caducadoCant: string;
  unidVendCant: string;
  unidVendValor: string;
  dctoPrecio: string;
  dctoPromocion: string;
  devolUnidadesValor: string;
  docDescuento: string;
};
type Credito = { key: string; id?: string; cliente: string; day: string; documento: string; factura: string; valor: string; conCobros: boolean };
type Cobro = { key: string; tipo: "COBRO" | "AJUSTE"; cliente: string; creditoId: string; fechaDocumento: string; documento: string; factura: string; valor: string };
type Pago = { key: string; documento: string; concepto: string; categoria: string; valor: string };
export type Pendiente = { creditoId: string; cliente: string; day: string; documento: string | null; saldo: number; dias: number; delVendedor: boolean };

export type PlanillaInicial = {
  id: string;
  day: string;
  estado: "BORRADOR" | "CERRADA" | "ANULADA";
  vendedor: string;
  acompanante: string | null;
  otrosDescuentos: number;
  entregado: number;
  entregadoDetalle: string | null;
  notes: string | null;
  auditoria: string | null;
  origen: string;
  lineas: {
    productoId: string;
    carga: number;
    cargaDetalle: string | null;
    devolucion: number;
    precio: number;
    caducadoCant: number;
    unidVendCant: number;
    unidVendValor: number;
    dctoPrecio: number;
    dctoPromocion: number;
    devolUnidadesValor: number;
    docDescuento: string | null;
  }[];
  creditos: { id: string; cliente: string; day: string; documento: string | null; factura: string | null; valor: number; conCobros: boolean }[];
  cobros: { tipo: string; cliente: string | null; creditoId: string | null; fechaDocumento: string | null; documento: string | null; factura: string | null; valor: number }[];
  pagos: { documento: string | null; concepto: string; categoria: string; valor: number }[];
};

/** Centavos a lo que se escribe: 80 -> "0.8", 0 -> "". */
const aTexto = (c: number) => (c ? String(c / 100) : "");
const numero = (t: string) => {
  const n = evaluarSuma(t);
  return Number.isFinite(n) ? n : NaN;
};
const unidades = (t: string) => Math.round(numero(t) || 0);
const plata = (t: string) => aCentavos(numero(t) || 0);
const malo = (t: string) => !Number.isFinite(numero(t)) || numero(t) < 0;

let llave = 0;
const nuevaLlave = () => "n" + ++llave;

const COLOR_SEMAFORO: Record<Semaforo, string> = {
  cuadra: "border-good-line bg-good-soft text-good",
  faltante: "border-bad-line bg-bad-soft text-bad",
  sobrante: "border-brand-200 bg-brand-50 text-brand-700",
};
const TEXTO_SEMAFORO: Record<Semaforo, string> = {
  cuadra: "Cuadra",
  faltante: "Faltante: entregó menos",
  sobrante: "Sobrante: entregó de más",
};

/**
 * La planilla del dia de un vendedor (ver lib/reparto.ts), como la hoja del
 * Excel: salida y regreso de productos, ventas a credito, cobros de cartera,
 * gastos y el cuadre de caja, que se recalcula mientras se escribe.
 */
export function PlanillaReparto({
  planilla,
  productos,
  clientes,
  pendientes,
  personas,
  currency,
}: {
  planilla: PlanillaInicial;
  productos: Producto[];
  clientes: string[];
  pendientes: Pendiente[];
  personas: string[];
  currency: string;
}) {
  const editable = planilla.estado === "BORRADOR";
  const $ = (c: number) => money(c, currency);

  // ---- estado
  const [lineas, setLineas] = useState<Record<string, Linea>>(() => {
    const salida: Record<string, Linea> = {};
    for (const p of productos) {
      const l = planilla.lineas.find((x) => x.productoId === p.id);
      salida[p.id] = {
        productoId: p.id,
        carga: l ? l.cargaDetalle ?? String(l.carga || "") : "",
        devolucion: l?.devolucion ? String(l.devolucion) : "",
        precio: aTexto(l ? l.precio : p.precioDia),
        caducadoCant: l?.caducadoCant ? String(l.caducadoCant) : "",
        unidVendCant: l?.unidVendCant ? String(l.unidVendCant) : "",
        unidVendValor: aTexto(l?.unidVendValor ?? 0),
        dctoPrecio: aTexto(l?.dctoPrecio ?? 0),
        dctoPromocion: aTexto(l?.dctoPromocion ?? 0),
        devolUnidadesValor: aTexto(l?.devolUnidadesValor ?? 0),
        docDescuento: l?.docDescuento ?? "",
      };
    }
    return salida;
  });
  const [creditos, setCreditos] = useState<Credito[]>(() =>
    planilla.creditos.map((c) => ({ key: c.id, id: c.id, cliente: c.cliente, day: c.day, documento: c.documento ?? "", factura: c.factura ?? "", valor: aTexto(c.valor), conCobros: c.conCobros }))
  );
  const [cobros, setCobros] = useState<Cobro[]>(() =>
    planilla.cobros.map((c) => ({
      key: nuevaLlave(),
      tipo: c.tipo === "AJUSTE" ? "AJUSTE" : "COBRO",
      cliente: c.cliente ?? "",
      creditoId: c.creditoId ?? "",
      fechaDocumento: c.fechaDocumento ?? "",
      documento: c.documento ?? "",
      factura: c.factura ?? "",
      valor: aTexto(c.valor),
    }))
  );
  const [pagos, setPagos] = useState<Pago[]>(() =>
    planilla.pagos.map((p) => ({ key: nuevaLlave(), documento: p.documento ?? "", concepto: p.concepto, categoria: p.categoria, valor: aTexto(p.valor) }))
  );
  const [entregado, setEntregado] = useState(planilla.entregadoDetalle ?? aTexto(planilla.entregado));
  const [acompanante, setAcompanante] = useState(planilla.acompanante ?? "");
  const [otros, setOtros] = useState(aTexto(planilla.otrosDescuentos));
  const [notas, setNotas] = useState(planilla.notes ?? "");
  const [masColumnas, setMasColumnas] = useState(false);
  const [soloConMovimiento, setSoloConMovimiento] = useState(!editable);
  const [buscarPendiente, setBuscarPendiente] = useState("");
  const [sucio, setSucio] = useState(false);
  const [mensaje, setMensaje] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();
  // Cuenta los cambios: lo que se escribe mientras se guarda no queda como guardado.
  const cambios = useRef(0);
  const marcarCambio = () => {
    cambios.current++;
    setSucio(true);
  };

  const tocar = <T,>(fn: (v: T) => void) => (v: T) => {
    marcarCambio();
    fn(v);
  };

  // ---- cuadre en vivo
  const cuadre = useMemo(
    () =>
      calcularCuadre({
        lineas: Object.values(lineas).map((l) => ({
          carga: unidades(l.carga),
          devolucion: unidades(l.devolucion),
          precio: plata(l.precio),
          unidVendValor: plata(l.unidVendValor),
          dctoPrecio: plata(l.dctoPrecio),
          dctoPromocion: plata(l.dctoPromocion),
          caducadoCant: unidades(l.caducadoCant),
          devolUnidadesValor: plata(l.devolUnidadesValor),
        })),
        otrosDescuentos: plata(otros),
        creditos: creditos.map((c) => ({ valor: plata(c.valor) })),
        cobros: cobros.map((c) => ({ valor: plata(c.valor) })),
        pagos: pagos.map((p) => ({ valor: plata(p.valor) })),
        entregado: plata(entregado),
      }),
    [lineas, otros, creditos, cobros, pagos, entregado]
  );

  const cambiarLinea = (id: string, campo: keyof Linea, valor: string) => {
    marcarCambio();
    setLineas((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  };
  const totalDe = (l: Linea) =>
    totalLineaDe({
      carga: unidades(l.carga),
      devolucion: unidades(l.devolucion),
      precio: plata(l.precio),
      unidVendValor: plata(l.unidVendValor),
      dctoPrecio: plata(l.dctoPrecio),
      dctoPromocion: plata(l.dctoPromocion),
      caducadoCant: unidades(l.caducadoCant),
      devolUnidadesValor: plata(l.devolUnidadesValor),
    });
  const tieneMovimiento = (l: Linea) =>
    [l.carga, l.devolucion, l.caducadoCant, l.unidVendValor, l.dctoPrecio, l.dctoPromocion, l.devolUnidadesValor].some((x) => numero(x) > 0);
  const visibles = productos.filter((p) => !soloConMovimiento || tieneMovimiento(lineas[p.id]));

  const pendientesVisibles = useMemo(() => {
    const q = claveDe(buscarPendiente);
    const usados = new Set(cobros.map((c) => c.creditoId).filter(Boolean));
    return pendientes
      .filter((p) => !usados.has(p.creditoId))
      .filter((p) => (q ? claveDe(p.cliente + " " + (p.documento ?? "")).includes(q) : p.delVendedor))
      .slice(0, 40);
  }, [pendientes, buscarPendiente, cobros]);

  // ---- guardar
  function guardar(confirmado = false) {
    setMensaje(null);
    setConfirmar(null);
    if (!navigator.onLine) {
      setMensaje({ kind: "error", text: "Sin señal: guarda cuando vuelva la señal. No cierres esta pantalla." });
      return;
    }
    const pedido: PlanillaPedida = {
      id: planilla.id,
      acompanante,
      otrosDescuentos: otros,
      entregado,
      notes: notas,
      confirmado,
      lineas: Object.values(lineas),
      creditos: creditos.map((c) => ({ id: c.id, cliente: c.cliente, day: c.day, documento: c.documento, factura: c.factura, valor: c.valor })),
      cobros: cobros.map((c) => ({ tipo: c.tipo, cliente: c.cliente, creditoId: c.creditoId, fechaDocumento: c.fechaDocumento, documento: c.documento, factura: c.factura, valor: c.valor })),
      pagos: pagos.map((p) => ({ documento: p.documento, concepto: p.concepto, categoria: p.categoria, valor: p.valor })),
    };
    const version = cambios.current;
    // Los ids vuelven en el orden en que se mandaron: se ponen por fila, no por
    // posicion, por si mientras tanto se quito un credito.
    const enviados = creditos.map((c) => c.key);
    startTransition(async () => {
      try {
        const r = await guardarPlanillaAction(pedido);
        if (r?.confirmar) setConfirmar(r.confirmar);
        else if (r?.error) setMensaje({ kind: "error", text: r.error });
        else {
          if (cambios.current === version) setSucio(false);
          setAvisos(r?.avisos ?? []);
          const ids = r?.creditosIds ?? [];
          setCreditos((prev) =>
            prev.map((c) => {
              const id = ids[enviados.indexOf(c.key)];
              return id ? { ...c, id } : c;
            })
          );
          setMensaje({ kind: "ok", text: r?.ok ?? "Guardada." });
        }
      } catch {
        setMensaje({ kind: "error", text: "No se pudo guardar. Revisa la conexión e inténtalo otra vez." });
      }
    });
  }

  const input = (extra = "") => "input px-1.5 py-1 text-right text-[13px] " + extra;
  const campoMalo = (t: string) => (malo(t) ? " border-bad text-bad" : "");

  return (
    <div className="grid gap-4 pb-28 lg:grid-cols-[1fr_300px] lg:pb-0 [&>*]:min-w-0" data-planilla-reparto>
      <div className="space-y-4">
        {mensaje && <Alert kind={mensaje.kind}>{mensaje.text}</Alert>}
        {avisos.length > 0 && (
          <div className="rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-[13px] text-warn" data-avisos>
            {avisos.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
        )}
        {confirmar && (
          <div className="rounded-xl border border-bad-line bg-bad-soft p-3 text-sm text-bad" data-confirmar>
            <p>{confirmar}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn-primary btn-sm" onClick={() => guardar(true)}>
                Guardar igual
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmar(null)}>
                Corregir
              </button>
            </div>
          </div>
        )}
        {!editable && (
          <p className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-muted">
            Esta planilla está {planilla.estado === "CERRADA" ? "cerrada" : "anulada"}: no se puede cambiar.
            {planilla.estado === "CERRADA" && " Para corregirla, reábrela abajo (queda anotado)."}
          </p>
        )}

        {/* ---------------------------------------------------- productos */}
        <section className="card" data-seccion="productos">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-[16px] text-strong">Salida y regreso de productos</h2>
            <div className="flex flex-wrap gap-3 text-xs text-body">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={soloConMovimiento} onChange={(e) => setSoloConMovimiento(e.target.checked)} />
                Solo los que se movieron
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={masColumnas} onChange={(e) => setMasColumnas(e.target.checked)} data-mas-columnas />
                Descuentos y devoluciones
              </label>
            </div>
          </header>
          <p className="mb-2 text-[11px] text-subtle">
            En carga se puede escribir la suma de dos cargas, como en el Excel: 105+55. Desliza la tabla para ver todo →
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="sticky left-0 z-10 bg-panel py-1.5 pr-2">Producto</th>
                  <th className="w-20 px-1">Carga</th>
                  <th className="w-16 px-1">Devol</th>
                  <th className="w-14 px-1 text-right">Vend.</th>
                  <th className="w-16 px-1">Precio</th>
                  <th className="w-14 px-1">Caduc.</th>
                  {masColumnas && (
                    <>
                      <th className="w-16 px-1">Unid. vend $</th>
                      <th className="w-16 px-1">Dcto precio</th>
                      <th className="w-16 px-1">Dcto promo</th>
                      <th className="w-16 px-1">Devol. unid $</th>
                      <th className="w-20 px-1">Doc. dcto</th>
                    </>
                  )}
                  <th className="w-20 px-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const l = lineas[p.id];
                  const vendida = unidades(l.carga) - unidades(l.devolucion);
                  const total = totalDe(l);
                  return (
                    <tr key={p.id} className="border-t border-line" data-producto={p.code}>
                      <td className="sticky left-0 z-10 bg-panel py-1 pr-2">
                        <span className="block max-w-[150px] truncate text-[12px] font-medium text-strong" title={p.name}>
                          {p.name}
                        </span>
                        <span className="text-[10px] text-subtle">{p.code}</span>
                      </td>
                      <td className="px-1">
                        <input className={input(campoMalo(l.carga))} inputMode="decimal" value={l.carga} disabled={!editable} onChange={(e) => cambiarLinea(p.id, "carga", e.target.value)} aria-label={"Carga " + p.name} />
                      </td>
                      <td className="px-1">
                        <input className={input(campoMalo(l.devolucion) + (vendida < 0 ? " border-warn text-warn" : ""))} inputMode="numeric" value={l.devolucion} disabled={!editable} onChange={(e) => cambiarLinea(p.id, "devolucion", e.target.value)} aria-label={"Devolución " + p.name} />
                      </td>
                      <td className={"px-1 text-right font-semibold " + (vendida < 0 ? "text-warn" : "text-strong")}>{vendida || ""}</td>
                      <td className="px-1">
                        <input className={input(campoMalo(l.precio))} inputMode="decimal" value={l.precio} disabled={!editable} onChange={(e) => cambiarLinea(p.id, "precio", e.target.value)} aria-label={"Precio " + p.name} />
                      </td>
                      <td className="px-1">
                        <input className={input(campoMalo(l.caducadoCant))} inputMode="numeric" value={l.caducadoCant} disabled={!editable} onChange={(e) => cambiarLinea(p.id, "caducadoCant", e.target.value)} aria-label={"Caducados " + p.name} />
                      </td>
                      {masColumnas && (
                        <>
                          {(["unidVendValor", "dctoPrecio", "dctoPromocion", "devolUnidadesValor"] as const).map((k) => (
                            <td key={k} className="px-1">
                              <input className={input(campoMalo(l[k]))} inputMode="decimal" value={l[k]} disabled={!editable} onChange={(e) => cambiarLinea(p.id, k, e.target.value)} aria-label={k + " " + p.name} />
                            </td>
                          ))}
                          <td className="px-1">
                            <input className="input px-1.5 py-1 text-[13px]" value={l.docDescuento} disabled={!editable} onChange={(e) => cambiarLinea(p.id, "docDescuento", e.target.value)} aria-label={"Documento del descuento " + p.name} />
                          </td>
                        </>
                      )}
                      <td className={"px-1 text-right font-semibold " + (total < 0 ? "text-bad" : "text-strong")}>{total ? $(total) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line font-semibold">
                  <td className="sticky left-0 bg-panel py-1.5 pr-2 text-[12px]">Total general por ventas</td>
                  <td colSpan={masColumnas ? 10 : 5} />
                  <td className="px-1 text-right" data-total-general>{$(cuadre.totalGeneral)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="(−) Otros descuentos de ventas">
              <input className={"input" + campoMalo(otros)} inputMode="decimal" value={otros} disabled={!editable} onChange={(e) => tocar(setOtros)(e.target.value)} />
            </Field>
            <div className="flex flex-col justify-end">
              <span className="text-[11px] text-muted">Total ventas reparto</span>
              <span className="text-lg font-bold text-strong">{$(cuadre.ventasDiaria)}</span>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- creditos */}
        <section className="card" data-seccion="creditos">
          <header className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-[16px] text-strong">Ventas a crédito del día</h2>
            <span className="text-sm font-bold text-strong">{$(cuadre.credito)}</span>
          </header>
          <datalist id="clientes-reparto">
            {clientes.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <ul className="space-y-2">
            {creditos.map((c, i) => (
              <li key={c.key} className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface p-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" data-credito>
                <input className="input col-span-2 py-1 text-[13px] sm:col-span-1" list="clientes-reparto" placeholder="Cliente" value={c.cliente} disabled={!editable} onChange={(e) => tocar(setCreditos)(creditos.map((x) => (x.key === c.key ? { ...x, cliente: e.target.value } : x)))} aria-label={"Cliente del crédito " + (i + 1)} />
                <input className="input py-1 text-[13px]" type="date" value={c.day} disabled={!editable} onChange={(e) => tocar(setCreditos)(creditos.map((x) => (x.key === c.key ? { ...x, day: e.target.value } : x)))} aria-label="Fecha" />
                <input className="input py-1 text-[13px]" placeholder="Documento" value={c.documento} disabled={!editable} onChange={(e) => tocar(setCreditos)(creditos.map((x) => (x.key === c.key ? { ...x, documento: e.target.value } : x)))} aria-label="Documento" />
                <input className="input py-1 text-[13px]" placeholder="Factura" value={c.factura} disabled={!editable} onChange={(e) => tocar(setCreditos)(creditos.map((x) => (x.key === c.key ? { ...x, factura: e.target.value } : x)))} aria-label="Factura" />
                <input className={"input py-1 text-right text-[13px]" + campoMalo(c.valor)} inputMode="decimal" placeholder="Valor" value={c.valor} disabled={!editable} onChange={(e) => tocar(setCreditos)(creditos.map((x) => (x.key === c.key ? { ...x, valor: e.target.value } : x)))} aria-label={"Valor del crédito " + (i + 1)} />
                {editable && (
                  <button type="button" className="btn-ghost btn-sm px-2 text-bad" disabled={c.conCobros} title={c.conCobros ? "Ya tiene cobros: no se puede quitar" : "Quitar"} onClick={() => tocar(setCreditos)(creditos.filter((x) => x.key !== c.key))} aria-label="Quitar crédito">
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => tocar(setCreditos)([...creditos, { key: nuevaLlave(), cliente: "", day: planilla.day, documento: "", factura: "", valor: "", conCobros: false }])}>
              <Icon name="plus" className="h-4 w-4" />
              Crédito
            </button>
          )}
        </section>

        {/* ---------------------------------------------------- cobros */}
        <section className="card" data-seccion="cobros">
          <header className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-[16px] text-strong">Recaudación de cartera</h2>
            <span className="text-sm font-bold text-strong">{$(cuadre.cartera)}</span>
          </header>
          <ul className="space-y-2">
            {cobros.map((c, i) => (
              <li key={c.key} className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface p-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" data-cobro>
                {c.tipo === "AJUSTE" ? (
                  <span className="col-span-2 self-center text-[13px] font-semibold text-strong sm:col-span-4">DIF A FAVOR (ajuste, suma a la caja)</span>
                ) : (
                  <>
                    <input className="input col-span-2 py-1 text-[13px] sm:col-span-1" list="clientes-reparto" placeholder="Cliente" value={c.cliente} disabled={!editable} onChange={(e) => tocar(setCobros)(cobros.map((x) => (x.key === c.key ? { ...x, cliente: e.target.value, creditoId: "" } : x)))} aria-label={"Cliente del cobro " + (i + 1)} />
                    <input className="input py-1 text-[13px]" type="date" value={c.fechaDocumento} disabled={!editable} onChange={(e) => tocar(setCobros)(cobros.map((x) => (x.key === c.key ? { ...x, fechaDocumento: e.target.value } : x)))} aria-label="Fecha del documento" />
                    <input className="input py-1 text-[13px]" placeholder="Documento" value={c.documento} disabled={!editable} onChange={(e) => tocar(setCobros)(cobros.map((x) => (x.key === c.key ? { ...x, documento: e.target.value, creditoId: "" } : x)))} aria-label="Documento" />
                    <input className="input py-1 text-[13px]" placeholder="Factura" value={c.factura} disabled={!editable} onChange={(e) => tocar(setCobros)(cobros.map((x) => (x.key === c.key ? { ...x, factura: e.target.value } : x)))} aria-label="Factura" />
                  </>
                )}
                <input className={"input py-1 text-right text-[13px]" + campoMalo(c.valor)} inputMode="decimal" placeholder="Valor" value={c.valor} disabled={!editable} onChange={(e) => tocar(setCobros)(cobros.map((x) => (x.key === c.key ? { ...x, valor: e.target.value } : x)))} aria-label={"Valor del cobro " + (i + 1)} />
                {editable && (
                  <button type="button" className="btn-ghost btn-sm px-2 text-bad" onClick={() => tocar(setCobros)(cobros.filter((x) => x.key !== c.key))} aria-label="Quitar cobro">
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn-ghost btn-sm" onClick={() => tocar(setCobros)([...cobros, { key: nuevaLlave(), tipo: "COBRO", cliente: "", creditoId: "", fechaDocumento: "", documento: "", factura: "", valor: "" }])}>
                  <Icon name="plus" className="h-4 w-4" />
                  Abono libre
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => tocar(setCobros)([...cobros, { key: nuevaLlave(), tipo: "AJUSTE", cliente: "", creditoId: "", fechaDocumento: "", documento: "", factura: "", valor: "" }])}>
                  <Icon name="plus" className="h-4 w-4" />
                  DIF A FAVOR
                </button>
              </div>
              <details className="mt-3 rounded-xl border border-line p-2.5" open={cobros.length === 0} data-pendientes>
                <summary className="cursor-pointer text-[13px] font-semibold text-brand-600">Cobrar un documento pendiente</summary>
                <input className="input mt-2 py-1.5 text-sm" placeholder="Buscar cliente o documento (sin buscar: los de este vendedor)" value={buscarPendiente} onChange={(e) => setBuscarPendiente(e.target.value)} />
                <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto">
                  {pendientesVisibles.map((p) => (
                    <li key={p.creditoId} className="flex items-center gap-2 py-1.5 text-[13px]">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-strong">{p.cliente}</span>
                        <span className="text-[11px] text-subtle">
                          Doc. {p.documento ?? "s/n"} · {p.day.split("-").reverse().join("/")} · {p.dias} días
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-strong">{$(p.saldo)}</span>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() =>
                          tocar(setCobros)([
                            ...cobros,
                            { key: nuevaLlave(), tipo: "COBRO", cliente: p.cliente, creditoId: p.creditoId, fechaDocumento: p.day, documento: p.documento ?? "", factura: "", valor: aTexto(p.saldo) },
                          ])
                        }
                      >
                        Cobrar
                      </button>
                    </li>
                  ))}
                  {pendientesVisibles.length === 0 && <li className="py-2 text-[12px] text-subtle">Nada pendiente con eso.</li>}
                </ul>
              </details>
            </>
          )}
        </section>

        {/* ---------------------------------------------------- pagos */}
        <section className="card" data-seccion="pagos">
          <header className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-[16px] text-strong">Pagos y desembolsos de caja</h2>
            <span className="text-sm font-bold text-strong">{$(cuadre.pagos)}</span>
          </header>
          <ul className="space-y-2">
            {pagos.map((p, i) => (
              <li key={p.key} className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface p-2 sm:grid-cols-[1fr_2fr_1.3fr_1fr_auto]" data-pago>
                <input className="input py-1 text-[13px]" placeholder="Documento" value={p.documento} disabled={!editable} onChange={(e) => tocar(setPagos)(pagos.map((x) => (x.key === p.key ? { ...x, documento: e.target.value } : x)))} aria-label="Documento del gasto" />
                <input
                  className="input py-1 text-[13px]"
                  placeholder="Concepto (ALMUERZO, DEPOSITO...)"
                  value={p.concepto}
                  disabled={!editable}
                  onChange={(e) =>
                    tocar(setPagos)(pagos.map((x) => (x.key === p.key ? { ...x, concepto: e.target.value, categoria: categoriaDePago(e.target.value, personas) } : x)))
                  }
                  aria-label={"Concepto del gasto " + (i + 1)}
                />
                <select className="input py-1 text-[13px]" value={p.categoria} disabled={!editable} onChange={(e) => tocar(setPagos)(pagos.map((x) => (x.key === p.key ? { ...x, categoria: e.target.value } : x)))} aria-label="Categoría">
                  {CATEGORIAS_PAGO.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input className={"input py-1 text-right text-[13px]" + campoMalo(p.valor)} inputMode="decimal" placeholder="Valor" value={p.valor} disabled={!editable} onChange={(e) => tocar(setPagos)(pagos.map((x) => (x.key === p.key ? { ...x, valor: e.target.value } : x)))} aria-label={"Valor del gasto " + (i + 1)} />
                {editable && (
                  <button type="button" className="btn-ghost btn-sm px-2 text-bad" onClick={() => tocar(setPagos)(pagos.filter((x) => x.key !== p.key))} aria-label="Quitar gasto">
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => tocar(setPagos)([...pagos, { key: nuevaLlave(), documento: "", concepto: "", categoria: "otro", valor: "" }])}>
              <Icon name="plus" className="h-4 w-4" />
              Gasto
            </button>
          )}
        </section>

        {/* ---------------------------------------------------- entrega */}
        <section className="card" data-seccion="entrega">
          <h2 className="mb-3 font-display text-[16px] text-strong">Entrega de efectivo</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Efectivo entregado" hint="Se puede escribir como suma: 33.15+246">
              <input className={"input" + campoMalo(entregado)} inputMode="decimal" value={entregado} disabled={!editable} onChange={(e) => tocar(setEntregado)(e.target.value)} data-entregado />
            </Field>
            <Field label="Acompañante">
              <input className="input" value={acompanante} disabled={!editable} onChange={(e) => tocar(setAcompanante)(e.target.value)} placeholder="SÓLO" />
            </Field>
          </div>
          <Field label="Observaciones" className="mt-3">
            <input className="input" value={notas} disabled={!editable} onChange={(e) => tocar(setNotas)(e.target.value)} />
          </Field>
        </section>

        <AccionesPlanilla planilla={planilla} sucio={sucio} />
      </div>

      {/* ---------------------------------------------------- cuadre */}
      <aside className="lg:sticky lg:top-4 lg:self-start" data-cuadre>
        <div className="card space-y-1.5 text-[13px]">
          <h2 className="mb-2 font-display text-[16px] text-strong">Cuadre de caja</h2>
          <Renglon label="Total ventas diaria" valor={$(cuadre.ventasDiaria)} />
          <Renglon label="(−) Ventas a crédito" valor={$(cuadre.credito)} />
          <Renglon label="Total ventas contado" valor={$(cuadre.contado)} fuerte />
          <Renglon label="(+) Recaudación cartera" valor={$(cuadre.cartera)} />
          <Renglon label="Total efectivo recibido" valor={$(cuadre.recibido)} fuerte />
          <Renglon label="(−) Pagos y desembolsos" valor={$(cuadre.pagos)} />
          <Renglon label="Total efectivo caja" valor={$(cuadre.caja)} fuerte />
          <Renglon label="Efectivo entregado" valor={$(cuadre.entregado)} />
          <div className={"mt-2 rounded-xl border px-3 py-2 " + COLOR_SEMAFORO[cuadre.semaforo]} data-semaforo={cuadre.semaforo}>
            <p className="text-[11px] font-semibold uppercase tracking-wide">{TEXTO_SEMAFORO[cuadre.semaforo]}</p>
            <p className="text-xl font-bold" data-diferencia>
              {$(cuadre.diferencia)}
            </p>
            <p className="text-[11px]">
              Faltante {$(cuadre.faltante)} · Sobrante {$(cuadre.sobrante)}
            </p>
          </div>
          {editable && (
            <button type="button" className="btn-success mt-3 hidden w-full justify-center lg:flex" disabled={guardando} onClick={() => guardar()}>
              <Icon name="check" className="h-4 w-4" />
              {guardando ? "Guardando..." : sucio ? "Guardar planilla" : "Guardada"}
            </button>
          )}
        </div>
      </aside>

      {/* En el celular, el cuadre y guardar quedan siempre a la vista. */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-panel px-3 py-2 shadow-lg lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className={"min-w-0 flex-1 rounded-lg border px-2 py-1 " + COLOR_SEMAFORO[cuadre.semaforo]}>
            <p className="text-[10px] font-semibold uppercase">{TEXTO_SEMAFORO[cuadre.semaforo]}</p>
            <p className="text-sm font-bold">{$(cuadre.diferencia)}</p>
          </div>
          {editable && (
            <button type="button" className="btn-success shrink-0" disabled={guardando} onClick={() => guardar()} data-guardar-planilla>
              <Icon name="check" className="h-4 w-4" />
              {guardando ? "Guardando..." : sucio ? "Guardar" : "Guardada"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Renglon({ label, valor, fuerte = false }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <p className={"flex justify-between gap-2 " + (fuerte ? "border-t border-line pt-1.5 font-semibold text-strong" : "text-body")}>
      <span>{label}</span>
      <span>{valor}</span>
    </p>
  );
}

/** Cerrar, reabrir (con motivo), anular o borrar la planilla. */
function AccionesPlanilla({ planilla, sucio }: { planilla: PlanillaInicial; sucio: boolean }) {
  const [cierre, cerrar] = useActionState(cerrarPlanillaAction, undefined);
  const [reapertura, reabrir] = useActionState(reabrirPlanillaAction, undefined);
  const [anulacion, anular] = useActionState(anularPlanillaAction, undefined);
  // El mensaje es el de lo ultimo que se pidio, no el del primero que contesto.
  const [ultima, setUltima] = useState<"cerrar" | "reabrir" | "anular" | null>(null);
  const estado = ultima === "cerrar" ? cierre : ultima === "reabrir" ? reapertura : ultima === "anular" ? anulacion : undefined;

  return (
    <section className="card space-y-3" data-seccion="estado">
      <h2 className="font-display text-[16px] text-strong">Estado de la planilla</h2>
      {estado?.error && <Alert kind="error">{estado.error}</Alert>}
      {estado?.ok && <Alert kind="ok">{estado.ok}</Alert>}
      <div className="flex flex-wrap gap-2">
        {planilla.estado === "BORRADOR" && (
          <form action={cerrar} onSubmit={() => setUltima("cerrar")}>
            <input type="hidden" name="id" value={planilla.id} />
            <SubmitButton className="btn-primary btn-sm" pendingText="Cerrando..." disabled={sucio}>
              <Icon name="lock" className="h-4 w-4" />
              Cerrar planilla
            </SubmitButton>
            {sucio && <p className="mt-1 text-[11px] text-warn">Guarda los cambios antes de cerrarla.</p>}
          </form>
        )}
        {planilla.estado === "BORRADOR" && (
          <form action={borrarPlanillaAction}>
            <input type="hidden" name="id" value={planilla.id} />
            <BotonBorrar
              className="btn-ghost btn-sm text-bad"
              ariaLabel="Borrar planilla"
              aviso={{
                titulo: "¿Borrar esta planilla?",
                que: [planilla.vendedor + " · " + planilla.day.split("-").reverse().join("/")],
                efectos: ["Se borran sus productos, créditos, cobros y gastos. Si alguien ya cobró uno de sus créditos en otra planilla, no se borra."],
              }}
            >
              <Icon name="trash" className="h-4 w-4" />
              Borrar
            </BotonBorrar>
          </form>
        )}
      </div>
      {planilla.estado !== "BORRADOR" && (
        <form action={reabrir} onSubmit={() => setUltima("reabrir")} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={planilla.id} />
          <Field label="Reabrir para corregir (queda anotado)" className="min-w-0 flex-1">
            <input className="input py-1.5 text-sm" name="motivo" placeholder="Por qué se reabre" required />
          </Field>
          <SubmitButton className="btn-ghost btn-sm" pendingText="...">
            Reabrir
          </SubmitButton>
        </form>
      )}
      {planilla.estado !== "ANULADA" && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-bad">Anular la planilla</summary>
          <form action={anular} onSubmit={() => setUltima("anular")} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={planilla.id} />
            <Field label="Se guarda pero no cuenta en reportes ni cartera" className="min-w-0 flex-1">
              <input className="input py-1.5 text-sm" name="motivo" placeholder="Por qué se anula" required />
            </Field>
            <SubmitButton className="btn-ghost btn-sm text-bad" pendingText="...">
              Anular
            </SubmitButton>
          </form>
        </details>
      )}
      {planilla.auditoria && (
        <div className="rounded-xl border border-line bg-surface p-2.5 text-[11px] text-muted" data-auditoria>
          <p className="mb-1 font-semibold uppercase tracking-wide">Historial</p>
          {planilla.auditoria.split("\n").map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}
    </section>
  );
}
