"use client";

import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import {
  borrarPagoAction,
  guardarCompraAction,
  guardarProveedorAction,
  pagarCompraAction,
  type CompraPedida,
} from "@/actions/por-pagar";
import { dinero, leerCifra, subtotalDe, totalDe } from "@/lib/por-pagar";
import { normalizar as normalizarDescripcion } from "@/lib/orden-productos";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";
import { SubmitButton } from "./SubmitButton";
import { BotonBorrar } from "./BotonBorrar";

/** Una cifra como se escribe en el campo: con coma y sin separar miles. */
function aCampo(n: number | null): string {
  return n === null ? "" : String(n).replace(".", ",");
}

/**
 * Ventana a pantalla completa en el celular y centrada en el computador. Por
 * debajo del menu de imprimir y del cuadro de borrar (ver VistaPreviaFactura).
 */
function Ventana({
  titulo,
  onCerrar,
  children,
  ancha = false,
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  ancha?: boolean;
}) {
  useEffect(() => {
    const conEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", conEsc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", conEsc);
      document.body.style.overflow = antes;
    };
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        className={
          "flex max-h-[100dvh] w-full flex-col overflow-hidden bg-panel shadow-xl sm:max-h-[92dvh] sm:rounded-2xl " +
          (ancha ? "sm:max-w-3xl" : "sm:max-w-md")
        }
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="font-display text-[16px] text-strong">{titulo}</h2>
          <button type="button" onClick={onCerrar} className="btn-ghost btn-sm px-2" aria-label="Cerrar">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Proveedores

export function ProveedorForm({
  proveedor,
}: {
  proveedor?: { id: string; name: string; phone: string | null; notes: string | null };
}) {
  const [state, formAction] = useActionState(guardarProveedorAction, undefined);
  const [clave, setClave] = useState(0);

  // Al crear uno, el formulario vuelve a quedar vacio para el siguiente.
  useEffect(() => {
    if (state?.ok && !proveedor) setClave((k) => k + 1);
  }, [state, proveedor]);

  return (
    <form key={clave} action={formAction} className="space-y-2.5" data-form-proveedor>
      {proveedor && <input type="hidden" name="id" value={proveedor.id} />}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
      <Field label="Nombre del proveedor">
        <input className="input" name="name" required maxLength={80} defaultValue={proveedor?.name} placeholder="Ej: Cristian Pozo" />
      </Field>
      <Field label="Teléfono (opcional)">
        <input className="input" name="phone" inputMode="tel" defaultValue={proveedor?.phone ?? ""} />
      </Field>
      <Field label="Nota (opcional)">
        <input className="input" name="notes" defaultValue={proveedor?.notes ?? ""} placeholder="Ej: entrega los lunes" />
      </Field>
      <SubmitButton className="btn-primary btn-sm" pendingText="Guardando...">
        {proveedor ? "Guardar cambios" : "Agregar proveedor"}
      </SubmitButton>
    </form>
  );
}

// -------------------------------------------------------------------- Compras

export type Sugerencia = { description: string; unitPrice: number; salePrice: number | null };

export type CompraInicial = {
  id: string;
  day: string;
  document: string | null;
  notes: string | null;
  taxPct: number;
  items: { description: string; qty: number; unitPrice: number; discount: number; salePrice: number | null }[];
};

type Fila = { key: number; description: string; qty: string; unitPrice: string; discount: string; salePrice: string };

const filaVacia = (key: number): Fila => ({ key, description: "", qty: "", unitPrice: "", discount: "", salePrice: "" });

/** Lo escrito en una fila, como renglon para calcular. Lo que no es numero cuenta como cero. */
function renglonDe(f: Fila) {
  const n = (t: string) => (Number.isFinite(leerCifra(t)) ? leerCifra(t) : 0);
  return {
    qty: n(f.qty),
    unitPrice: n(f.unitPrice),
    discount: n(f.discount),
    salePrice: f.salePrice.trim() ? n(f.salePrice) : null,
  };
}

/**
 * Anotar una compra nueva, o corregir una que ya estaba.
 *
 * Como una hoja del Excel: un renglon por producto con cantidad, descripcion
 * y precio. Al escribir un producto que ya se le compro a ese proveedor, el
 * precio se pone solo con el de la ultima vez. El descuento y el precio de
 * venta (para la ganancia) van aparte porque no todos los proveedores los usan.
 */
export function CompraBoton({
  supplierId,
  proveedor,
  hoy,
  currency,
  sugerencias,
  compra,
  conDescuento: descuentoInicial = false,
  conVenta: ventaInicial = false,
  iva: ivaInicial = 0,
}: {
  supplierId: string;
  proveedor: string;
  hoy: string;
  currency: string;
  sugerencias: Sugerencia[];
  /** La compra a corregir. Sin ella es una compra nueva. */
  compra?: CompraInicial;
  conDescuento?: boolean;
  conVenta?: boolean;
  /** El IVA con que arranca: el de la ultima compra a este proveedor. */
  iva?: number;
}) {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      {compra ? (
        <button type="button" onClick={() => setAbierta(true)} className="btn-ghost btn-sm px-2" aria-label="Corregir compra">
          <Icon name="pencil" className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button type="button" onClick={() => setAbierta(true)} className="btn-primary btn-sm" data-nueva-compra>
          <Icon name="plus" className="h-4 w-4" />
          Nueva compra
        </button>
      )}
      {abierta && (
        <FormularioCompra
          supplierId={supplierId}
          proveedor={proveedor}
          hoy={hoy}
          currency={currency}
          sugerencias={sugerencias}
          compra={compra}
          descuentoInicial={descuentoInicial || Boolean(compra?.items.some((i) => i.discount > 0))}
          ventaInicial={ventaInicial || Boolean(compra?.items.some((i) => i.salePrice !== null))}
          ivaInicial={compra ? compra.taxPct : ivaInicial}
          onCerrar={() => setAbierta(false)}
        />
      )}
    </>
  );
}

function FormularioCompra({
  supplierId,
  proveedor,
  hoy,
  currency,
  sugerencias,
  compra,
  descuentoInicial,
  ventaInicial,
  ivaInicial,
  onCerrar,
}: {
  supplierId: string;
  proveedor: string;
  hoy: string;
  currency: string;
  sugerencias: Sugerencia[];
  compra?: CompraInicial;
  descuentoInicial: boolean;
  ventaInicial: boolean;
  ivaInicial: number;
  onCerrar: () => void;
}) {
  const [dia, setDia] = useState(compra?.day ?? hoy);
  const [documento, setDocumento] = useState(compra?.document ?? "");
  const [nota, setNota] = useState(compra?.notes ?? "");
  const [pagada, setPagada] = useState(false);
  const [conDescuento, setConDescuento] = useState(descuentoInicial);
  const [conVenta, setConVenta] = useState(ventaInicial);
  const [conIva, setConIva] = useState(ivaInicial > 0);
  const [iva, setIva] = useState(aCampo(ivaInicial > 0 ? ivaInicial : 15));
  const [filas, setFilas] = useState<Fila[]>(() =>
    compra
      ? compra.items.map((i, key) => ({
          key,
          description: i.description,
          qty: aCampo(i.qty),
          unitPrice: aCampo(i.unitPrice),
          discount: i.discount ? aCampo(i.discount) : "",
          salePrice: aCampo(i.salePrice),
        }))
      : [0, 1, 2].map(filaVacia)
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();

  const porNombre = new Map(sugerencias.map((s) => [normalizarDescripcion(s.description), s]));
  const escritas = filas.filter((f) => f.description.trim()).map(renglonDe);
  const pct = conIva && Number.isFinite(leerCifra(iva)) ? leerCifra(iva) : 0;
  const subtotal = totalDe(escritas);
  const total = totalDe(escritas, pct);
  const listaId = "productos-" + supplierId;

  function cambiar(key: number, campo: keyof Omit<Fila, "key">, valor: string) {
    setFilas((prev) =>
      prev.map((f) => {
        if (f.key !== key) return f;
        const nueva = { ...f, [campo]: valor };
        // Un producto que ya se le compro: el precio de la ultima vez.
        if (campo === "description") {
          const s = porNombre.get(normalizarDescripcion(valor));
          if (s) {
            if (!f.unitPrice.trim()) nueva.unitPrice = aCampo(s.unitPrice);
            if (!f.salePrice.trim() && s.salePrice !== null) nueva.salePrice = aCampo(s.salePrice);
          }
        }
        return nueva;
      })
    );
  }

  function guardar() {
    setError(null);
    if (!navigator.onLine) {
      setError("Sin señal: inténtalo cuando vuelva la señal.");
      return;
    }
    const pedido: CompraPedida = {
      id: compra?.id,
      supplierId,
      day: dia,
      document: documento,
      notes: nota,
      taxPct: conIva ? iva : "",
      pagada,
      items: filas
        .filter((f) => f.description.trim())
        .map((f) => ({
          description: f.description,
          qty: f.qty,
          unitPrice: f.unitPrice,
          discount: conDescuento ? f.discount : "",
          salePrice: conVenta ? f.salePrice : "",
        })),
    };
    startTransition(async () => {
      try {
        const r = await guardarCompraAction(pedido);
        if (r?.error) setError(r.error);
        else onCerrar();
      } catch {
        setError("No se pudo guardar. Revisa la conexión e inténtalo otra vez.");
      }
    });
  }

  return (
    <Ventana titulo={(compra ? "Corregir compra a " : "Compra a ") + proveedor} onCerrar={onCerrar} ancha>
      <div className="space-y-4" data-formulario-compra>
        {error && <Alert kind="error">{error}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha de la factura">
            <input className="input" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
          </Field>
          <Field label="N° de factura (opcional)">
            <input className="input" value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Ej: 001-012-000001064" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-body">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={conDescuento} onChange={(e) => setConDescuento(e.target.checked)} />
            Con descuento
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={conVenta} onChange={(e) => setConVenta(e.target.checked)} />
            Con precio de venta (ganancia)
          </label>
          <span className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={conIva} onChange={(e) => setConIva(e.target.checked)} data-con-iva />
              Con IVA
            </label>
            {conIva && (
              <span className="flex items-center gap-1">
                <input
                  className="input w-16 px-2 py-1 text-center text-sm"
                  inputMode="decimal"
                  value={iva}
                  onChange={(e) => setIva(e.target.value)}
                  aria-label="Porcentaje de IVA"
                />
                %
              </span>
            )}
          </span>
        </div>

        <datalist id={listaId}>
          {sugerencias.map((s) => (
            <option key={s.description} value={s.description} />
          ))}
        </datalist>

        <ul className="space-y-2">
          {filas.map((f, n) => {
            const r = renglonDe(f);
            return (
              <li key={f.key} className="rounded-xl border border-line bg-surface p-2.5" data-renglon>
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-[11px] text-subtle">{n + 1}</span>
                  <input
                    className="input min-w-0 flex-1 py-1.5 text-sm"
                    list={listaId}
                    value={f.description}
                    onChange={(e) => cambiar(f.key, "description", e.target.value)}
                    placeholder="Descripción"
                    aria-label={"Descripción del renglón " + (n + 1)}
                  />
                  <button
                    type="button"
                    onClick={() => setFilas((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== f.key) : [filaVacia(f.key + 1)]))}
                    className="btn-ghost btn-sm shrink-0 px-2 text-bad"
                    aria-label={"Quitar renglón " + (n + 1)}
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 pl-7 sm:grid-cols-5">
                  <Campo etiqueta="Cantidad" valor={f.qty} onChange={(v) => cambiar(f.key, "qty", v)} />
                  <Campo etiqueta="Precio uni." valor={f.unitPrice} onChange={(v) => cambiar(f.key, "unitPrice", v)} />
                  {conDescuento && (
                    <Campo etiqueta="Descuento" valor={f.discount} onChange={(v) => cambiar(f.key, "discount", v)} />
                  )}
                  {conVenta && (
                    <Campo etiqueta="Precio venta" valor={f.salePrice} onChange={(v) => cambiar(f.key, "salePrice", v)} />
                  )}
                  <div className="flex flex-col justify-end">
                    <span className="text-[11px] text-subtle">Subtotal</span>
                    <span className="text-sm font-semibold text-strong">
                      {f.description.trim() ? dinero(subtotalDe(r), currency) : "—"}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => setFilas((prev) => [...prev, filaVacia(Math.max(...prev.map((f) => f.key)) + 1)])}
          className="btn-ghost btn-sm"
        >
          <Icon name="plus" className="h-4 w-4" />
          Otro renglón
        </button>

        <Field label="Nota (opcional)">
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: descontado de las facturas" />
        </Field>

        {!compra && (
          <label className="flex items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={pagada} onChange={(e) => setPagada(e.target.checked)} data-ya-pagada />
            Ya está pagada (queda como cancelada)
          </label>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <div>
            {pct > 0 && (
              <p className="text-[11px] text-muted">
                Subtotal {dinero(subtotal, currency)} + IVA {aCampo(pct)}% {dinero(total - subtotal, currency)}
              </p>
            )}
            <p className="text-[11px] text-muted">Total de la compra</p>
            <p className="text-xl font-bold text-strong" data-total-compra>
              {dinero(total, currency)}
            </p>
          </div>
          <button type="button" onClick={guardar} disabled={guardando} className="btn-success">
            <Icon name="check" className="h-4 w-4" />
            {guardando ? "Guardando..." : compra ? "Guardar cambios" : "Guardar compra"}
          </button>
        </div>
      </div>
    </Ventana>
  );
}

function Campo({ etiqueta, valor, onChange }: { etiqueta: string; valor: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] text-subtle">{etiqueta}</span>
      <input
        className="input py-1.5 text-sm"
        inputMode="decimal"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-label={etiqueta}
      />
    </label>
  );
}

// ---------------------------------------------------------------------- Pagos

export type PagoVista = { id: string; amount: number; day: string; notes: string | null };

/**
 * Pagar una compra (toda o un abono) y ver lo que ya se le pago. El monto
 * arranca con lo que falta: lo normal es pagarla entera.
 */
export function PagosCompra({
  billId,
  proveedor,
  total,
  falta,
  pagos,
  hoy,
  currency,
}: {
  billId: string;
  proveedor: string;
  total: number;
  falta: number;
  pagos: PagoVista[];
  hoy: string;
  currency: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const [state, formAction] = useActionState(pagarCompraAction, undefined);
  const pendiente = falta > 0.004;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className={pendiente ? "btn-success btn-sm" : "btn-ghost btn-sm"}
        data-pagar-compra
      >
        <Icon name="wallet" className="h-3.5 w-3.5" />
        {pendiente ? "Pagar" : "Pagos"}
      </button>
      {abierta && (
        <Ventana titulo={"Pagos a " + proveedor} onCerrar={() => setAbierta(false)}>
          <div className="space-y-4">
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-line bg-surface p-2">
                <dt className="text-[11px] text-muted">Total</dt>
                <dd className="text-sm font-bold text-strong">{dinero(total, currency)}</dd>
              </div>
              <div className="rounded-xl border border-line bg-surface p-2">
                <dt className="text-[11px] text-muted">Pagado</dt>
                <dd className="text-sm font-bold text-good">{dinero(total - falta, currency)}</dd>
              </div>
              <div className="rounded-xl border border-line bg-surface p-2">
                <dt className="text-[11px] text-muted">Falta</dt>
                <dd className={"text-sm font-bold " + (pendiente ? "text-bad" : "text-good")}>{dinero(Math.max(0, falta), currency)}</dd>
              </div>
            </dl>

            {state?.error && <Alert kind="error">{state.error}</Alert>}
            {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

            {pendiente && (
              <form action={formAction} className="space-y-2.5 rounded-xl border border-line p-3" data-form-pago>
                <input type="hidden" name="billId" value={billId} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Cuánto pagas">
                    <input className="input" name="amount" inputMode="decimal" defaultValue={aCampo(Math.round(falta * 10000) / 10000)} required />
                  </Field>
                  <Field label="Día">
                    <input className="input" type="date" name="day" defaultValue={hoy} />
                  </Field>
                </div>
                <Field label="Nota (opcional)">
                  <input className="input" name="notes" placeholder="Ej: transferencia" />
                </Field>
                <SubmitButton className="btn-success btn-sm" pendingText="Guardando...">
                  <Icon name="check" className="h-4 w-4" />
                  Anotar pago
                </SubmitButton>
              </form>
            )}

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">Lo que ya se pagó</p>
              {pagos.length === 0 ? (
                <p className="text-sm text-subtle">Todavía no se le ha pagado nada a esta compra.</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {pagos.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-strong">{dinero(p.amount, currency)}</span>
                        <span className="ml-2 text-xs text-subtle">
                          {p.day.split("-").reverse().join("/")}
                          {p.notes ? " · " + p.notes : ""}
                        </span>
                      </span>
                      <form action={borrarPagoAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <BotonBorrar
                          ariaLabel="Borrar pago"
                          aviso={{
                            titulo: "¿Borrar este pago?",
                            que: [dinero(p.amount, currency) + " a " + proveedor, "Del " + p.day.split("-").reverse().join("/")],
                            efectos: ["La compra vuelve a deber ese valor."],
                          }}
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </BotonBorrar>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Ventana>
      )}
    </>
  );
}
