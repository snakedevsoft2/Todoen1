"use client";

import { useEffect, useRef, useState } from "react";
import { actualizarFacturaAction, emitirFacturaAction } from "@/actions/facturacion";
import { buildInvoicePdf, invoiceFileName, invoiceTirilla, type AutorizacionFactura, type InvoiceData } from "@/lib/invoice";
import { factorDe } from "@/lib/format";
import type { FacturaVista } from "@/lib/facturacion";
import { COMPRADOR_VACIO, DOCUMENTOS, TOPE_CONSUMIDOR_FINAL, type Comprador, type Pais } from "@/lib/facturacion/paises";
import { BotonImprimir } from "./BotonImprimir";
import { Icon } from "./Icon";

function descargar(archivo: File) {
  const url = URL.createObjectURL(archivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function documentoDe(f: FacturaVista): string {
  const c = f.comprador;
  if (c.consumidorFinal) return f.pais === "CO" ? "Consumidor final · NIT 222222222222" : "Consumidor final · 9999999999999";
  const tipo = DOCUMENTOS[f.pais].find((d) => d.value === c.tipoDocumento)?.label ?? "Documento";
  return tipo + " " + c.numero;
}

/** La factura normal con el bloque de la autorizacion encima. */
export type EmisorFactura = { ruc: string | null; razonSocial: string | null; establecimiento: string | null };

export function datosAutorizados(
  base: InvoiceData,
  f: FacturaVista,
  etiquetaImpuesto: string,
  emisor: EmisorFactura
): InvoiceData {
  const factor = factorDe(base.currency);
  const autorizacion: AutorizacionFactura = {
    pais: f.pais,
    numero: f.numero ?? "",
    etiquetaCodigo: f.etiquetaCodigo,
    codigo: f.codigo ?? "",
    // Colombia: el QR lleva al portal de la DIAN. Ecuador: la clave de acceso.
    qr: f.pais === "CO" ? f.qrUrl : f.codigo,
    fecha: f.autorizadaEn,
    pruebas: f.ambiente === "pruebas",
    compradorDocumento: documentoDe(f),
    emisorRuc: emisor.ruc,
    emisorRazonSocial: emisor.razonSocial,
    emisorEstablecimiento: emisor.establecimiento,
    subtotal: Math.round(f.subtotal * factor),
    impuesto: Math.round(f.impuesto * factor),
    etiquetaImpuesto,
  };
  return {
    ...base,
    clientName: f.comprador.consumidorFinal ? base.clientName : f.comprador.nombre,
    // El total de la factura autorizada es el que valido la entidad.
    total: Math.round(f.total * factor),
    autorizacion,
  };
}

const ETIQUETA_ESTADO: Record<FacturaVista["estado"], string> = {
  AUTORIZADA: "Autorizada",
  ENVIANDO: "Esperando autorización",
  RECHAZADA: "Rechazada",
  ERROR: "No se pudo enviar",
};

/**
 * La factura autorizada de una venta, en la lista de ventas.
 *
 * Pide los datos del comprador (o consumidor final), la emite y, apenas queda
 * autorizada, descarga el PDF: es lo que se le entrega al cliente. Si la
 * entidad tarda, se consulta sola unos segundos; si la rechaza, se muestra el
 * motivo para corregir y volver a intentar.
 */
export function FacturaAutorizada({
  saleId,
  pais,
  habilitada,
  inicial,
  base,
  etiquetaImpuesto,
  emisor,
  abrirDeUna = false,
}: {
  /** Abre los datos del comprador de una: recien vendida con "factura autorizada". */
  abrirDeUna?: boolean;
  saleId: string;
  pais: Pais;
  /** Si el negocio tiene la factura autorizada activa. */
  habilitada: boolean;
  inicial: FacturaVista | null;
  /** La factura normal de la venta. */
  base: InvoiceData;
  etiquetaImpuesto: string;
  /** RUC, razon social y sucursal, para el encabezado de la factura. */
  emisor: EmisorFactura;
}) {
  const [factura, setFactura] = useState<FacturaVista | null>(inicial);
  const [abierto, setAbierto] = useState(abrirDeUna && !inicial);
  const [comprador, setComprador] = useState<Comprador>(inicial?.comprador ?? COMPRADOR_VACIO);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error" | "info"; texto: string } | null>(null);
  const descargada = useRef(inicial?.estado === "AUTORIZADA");

  const tope = TOPE_CONSUMIDOR_FINAL[pais];
  const totalVenta = base.total / factorDe(base.currency);

  async function descargarPdf(f: FacturaVista) {
    try {
      descargar(await buildInvoicePdf(datosAutorizados(base, f, etiquetaImpuesto, emisor)));
    } catch {
      setAviso({ tono: "error", texto: "No se pudo armar el PDF. Vuelve a intentarlo." });
    }
  }

  function recibir(f: FacturaVista) {
    setFactura(f);
    if (f.estado === "AUTORIZADA") {
      setAbierto(false);
      setAviso({ tono: "ok", texto: "Factura " + f.numero + " autorizada." });
      // Se descarga de una: es lo que se le entrega al cliente.
      if (!descargada.current) {
        descargada.current = true;
        void descargarPdf(f);
      }
    } else if (f.estado === "ENVIANDO") {
      setAviso({ tono: "info", texto: "Enviada. Esperando la autorización…" });
    } else {
      setAviso({ tono: "error", texto: f.mensaje ?? ETIQUETA_ESTADO[f.estado] });
    }
  }

  // Mientras espera, se consulta sola cada pocos segundos por un minuto.
  useEffect(() => {
    if (factura?.estado !== "ENVIANDO") return;
    let vueltas = 0;
    const reloj = setInterval(async () => {
      vueltas += 1;
      if (vueltas > 15) return clearInterval(reloj);
      const r = await actualizarFacturaAction(factura.id).catch(() => null);
      if (r?.ok && r.factura.estado !== "ENVIANDO") {
        clearInterval(reloj);
        recibir(r.factura);
      }
    }, 4000);
    return () => clearInterval(reloj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factura?.estado, factura?.id]);

  async function emitir() {
    setOcupado(true);
    setAviso({ tono: "info", texto: "Enviando a la " + (pais === "CO" ? "DIAN" : "SRI") + "…" });
    try {
      const r = await emitirFacturaAction(saleId, comprador);
      if (!r.ok) setAviso({ tono: "error", texto: r.error });
      else recibir(r.factura);
    } catch {
      setAviso({ tono: "error", texto: "Sin conexión: la factura autorizada necesita internet." });
    } finally {
      setOcupado(false);
    }
  }

  async function actualizar() {
    if (!factura) return;
    setOcupado(true);
    try {
      const r = await actualizarFacturaAction(factura.id);
      if (!r.ok) setAviso({ tono: "error", texto: r.error });
      else recibir(r.factura);
    } catch {
      setAviso({ tono: "error", texto: "Sin conexión." });
    } finally {
      setOcupado(false);
    }
  }

  const cambiar = (campo: keyof Comprador, valor: string | boolean) => setComprador((c) => ({ ...c, [campo]: valor }));

  if (!factura && !habilitada) return null;

  const tonoAviso = aviso?.tono === "error" ? "text-bad" : aviso?.tono === "ok" ? "text-good" : "text-muted";

  return (
    <div className="w-full" data-factura-autorizada={factura?.estado ?? "ninguna"}>
      {factura && !abierto && (
        <div
          className={
            "rounded-xl border p-2.5 text-[12px] " +
            (factura.estado === "AUTORIZADA"
              ? "border-good-line bg-good-soft"
              : factura.estado === "ENVIANDO"
                ? "border-warn-line bg-warn-soft"
                : "border-bad/30 bg-surface")
          }
        >
          <p className="flex flex-wrap items-center gap-x-2 font-semibold text-strong">
            <Icon name="receipt" className="h-4 w-4" />
            {factura.estado === "AUTORIZADA" ? "Factura electrónica " + factura.numero : ETIQUETA_ESTADO[factura.estado]}
            {factura.ambiente === "pruebas" && (
              <span className="rounded-full border border-line px-1.5 text-[10px] uppercase text-muted">Pruebas</span>
            )}
          </p>
          {factura.estado === "AUTORIZADA" && factura.codigo && (
            <p className="mt-1 break-all text-[11px] text-muted">
              {factura.etiquetaCodigo}: {factura.codigo}
            </p>
          )}
          {factura.estado !== "AUTORIZADA" && factura.mensaje && <p className="mt-1 text-[11px] text-bad">{factura.mensaje}</p>}

          <div className="mt-2 flex flex-wrap gap-2">
            {factura.estado === "AUTORIZADA" && (
              <>
                <button type="button" className="btn-success btn-sm" onClick={() => descargarPdf(factura)}>
                  <Icon name="download" className="h-4 w-4" />
                  PDF autorizado
                </button>
                <BotonImprimir
                  tirilla={() => invoiceTirilla(datosAutorizados(base, factura, etiquetaImpuesto, emisor))}
                  nombreArchivo={invoiceFileName(datosAutorizados(base, factura, etiquetaImpuesto, emisor))}
                  logoUrl={base.logoUrl}
                />
                {factura.publicUrl && (
                  <a href={factura.publicUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                    Ver en {pais === "CO" ? "Factus" : "Dátil"}
                  </a>
                )}
              </>
            )}
            {(factura.estado === "ENVIANDO" || factura.estado === "ERROR") && (
              <button type="button" className="btn-ghost btn-sm" onClick={actualizar} disabled={ocupado}>
                {ocupado ? "Consultando…" : factura.estado === "ERROR" ? "Reintentar ahora" : "Actualizar"}
              </button>
            )}
            {factura.estado === "RECHAZADA" && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setAbierto(true)}>
                Corregir y reintentar
              </button>
            )}
          </div>
        </div>
      )}

      {!factura && !abierto && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => setAbierto(true)} disabled={base.provisional}>
          <Icon name="receipt" className="h-4 w-4" />
          Factura autorizada
        </button>
      )}

      {abierto && (
        <div className="space-y-2.5 rounded-xl border border-line bg-panel p-3" data-comprador>
          <p className="text-xs font-semibold text-strong">Factura autorizada · datos del comprador</p>
          <label className="flex items-start gap-2 text-[13px] text-body">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={comprador.consumidorFinal}
              onChange={(e) => cambiar("consumidorFinal", e.target.checked)}
            />
            <span>
              Consumidor final (sin datos)
              {tope !== null && (
                <span className={"block text-[11px] " + (totalVenta > tope ? "text-bad" : "text-muted")}>
                  En Ecuador solo hasta {tope} dólares.
                </span>
              )}
            </span>
          </label>

          {!comprador.consumidorFinal && (
            <div className="grid gap-2 sm:grid-cols-2">
              <select className="input py-1.5 text-sm" aria-label="Tipo de documento" value={comprador.tipoDocumento} onChange={(e) => cambiar("tipoDocumento", e.target.value)}>
                <option value="">Tipo de documento</option>
                {DOCUMENTOS[pais].map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <input className="input py-1.5 text-sm" aria-label="Número de documento" placeholder="Número, sin puntos" inputMode="numeric" value={comprador.numero} onChange={(e) => cambiar("numero", e.target.value)} />
              <input className="input py-1.5 text-sm sm:col-span-2" aria-label="Nombre o razón social" placeholder="Nombre o razón social" value={comprador.nombre} onChange={(e) => cambiar("nombre", e.target.value)} />
              {pais === "CO" && (
                <label className="flex items-center gap-2 text-[12px] text-body sm:col-span-2">
                  <input type="checkbox" className="h-4 w-4" checked={comprador.esEmpresa} onChange={(e) => cambiar("esEmpresa", e.target.checked)} />
                  Es una empresa (persona jurídica)
                </label>
              )}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input py-1.5 text-sm" type="email" aria-label="Correo del comprador" placeholder="Correo (le llega la factura)" value={comprador.correo} onChange={(e) => cambiar("correo", e.target.value)} />
            <input className="input py-1.5 text-sm" inputMode="tel" aria-label="Teléfono del comprador" placeholder="Teléfono (opcional)" value={comprador.telefono} onChange={(e) => cambiar("telefono", e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" onClick={emitir} disabled={ocupado}>
              {ocupado ? "Enviando…" : "Emitir factura autorizada"}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAbierto(false)} disabled={ocupado}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {aviso && <p className={"mt-1.5 text-[11px] " + tonoAviso}>{aviso.texto}</p>}
    </div>
  );
}
