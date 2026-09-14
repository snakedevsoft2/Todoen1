import type { LineaFiscal, Totales } from "./impuestos";
import { CODIGO_TARIFA_SRI, type Comprador } from "./paises";
import { ESPERA_MS, juntarMensajes, type Ambiente, type ResultadoProveedor } from "./tipos";

/**
 * Factura electronica de Ecuador (SRI) con la API de Datil.
 *
 * Datil firma el comprobante con la firma electronica del negocio, lo manda al
 * SRI, consulta la autorizacion y se lo envia al comprador por correo. La
 * autorizacion tarda unos segundos: si no llega en la respuesta, la factura
 * queda "enviando" y se consulta despues con su id.
 *
 * Documentacion: https://datil.dev (POST /invoices/issue, GET /invoices/<id>).
 * Los precios van SIN IVA. Codigos del IVA segun la tabla 17 del SRI.
 */

export type CredencialesDatil = { apiKey: string; certPassword: string };

export function credencialesDatilCompletas(c: Record<string, string> | null): c is CredencialesDatil {
  return Boolean(c?.apiKey && c?.certPassword);
}

function base(): string {
  return (process.env.DATIL_BASE_URL || "https://link.datil.co").replace(/\/$/, "");
}

export type EmisorDatil = {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  direccion: string;
  obligadoContabilidad: boolean;
  contribuyenteEspecial: string | null;
  establecimiento: string;
  puntoEmision: string;
};

export type DatosFacturaDatil = {
  secuencial: number;
  fecha: Date;
  emisor: EmisorDatil;
  comprador: Comprador;
  lineas: LineaFiscal[];
  totales: Totales;
  tarifa: number;
  metodoPago: string;
};

const MEDIO: Record<string, string> = {
  EFECTIVO: "efectivo",
  TARJETA: "tarjeta_credito",
  TRANSFERENCIA: "transferencia_bancaria",
  OTRO: "otros",
};

/** 001-001-000000123: como se lee el numero de una factura en Ecuador. */
export function numeroSri(establecimiento: string, punto: string, secuencial: number): string {
  return establecimiento + "-" + punto + "-" + String(secuencial).padStart(9, "0");
}

export function cuerpoDatil(ambiente: Ambiente, d: DatosFacturaDatil): Record<string, unknown> {
  const c = d.comprador;
  const codigoPorcentaje = CODIGO_TARIFA_SRI[d.tarifa] ?? "0";
  const contacto = {
    ...(c.correo ? { email: c.correo } : {}),
    ...(c.telefono ? { telefono: c.telefono } : {}),
    ...(c.direccion ? { direccion: c.direccion } : {}),
  };
  return {
    ambiente: ambiente === "produccion" ? 2 : 1,
    tipo_emision: 1,
    secuencial: d.secuencial,
    fecha_emision: d.fecha.toISOString(),
    moneda: "USD",
    emisor: {
      ruc: d.emisor.ruc,
      obligado_contabilidad: d.emisor.obligadoContabilidad,
      ...(d.emisor.contribuyenteEspecial ? { contribuyente_especial: d.emisor.contribuyenteEspecial } : {}),
      nombre_comercial: d.emisor.nombreComercial || d.emisor.razonSocial,
      razon_social: d.emisor.razonSocial,
      direccion: d.emisor.direccion,
      establecimiento: { punto_emision: d.emisor.puntoEmision, codigo: d.emisor.establecimiento, direccion: d.emisor.direccion },
    },
    comprador: c.consumidorFinal
      ? // Tabla 6 del SRI: venta a consumidor final, trece nueves.
        { identificacion: "9999999999999", tipo_identificacion: "07", razon_social: "CONSUMIDOR FINAL", ...contacto }
      : { identificacion: c.numero, tipo_identificacion: c.tipoDocumento, razon_social: c.nombre, ...contacto },
    totales: {
      total_sin_impuestos: d.totales.base,
      descuento: 0,
      propina: 0,
      importe_total: d.totales.total,
      impuestos: [{ base_imponible: d.totales.base, valor: d.totales.impuesto, codigo: "2", codigo_porcentaje: codigoPorcentaje }],
    },
    items: d.lineas.map((l, i) => ({
      cantidad: l.cantidad,
      codigo_principal: "ITEM" + (i + 1),
      descripcion: l.nombre.slice(0, 300),
      precio_unitario: l.precioNeto,
      descuento: 0,
      precio_total_sin_impuestos: l.base,
      impuestos: [{ base_imponible: l.base, valor: l.impuesto, tarifa: d.tarifa, codigo: "2", codigo_porcentaje: codigoPorcentaje }],
    })),
    pagos: [{ medio: MEDIO[d.metodoPago] ?? "otros", total: d.totales.total }],
  };
}

function leerRespuesta(datos: Record<string, unknown>, numero: string | null): ResultadoProveedor {
  const autorizacion = (datos.autorizacion ?? {}) as Record<string, unknown>;
  const estado = String(autorizacion.estado ?? datos.estado ?? "").toUpperCase();
  const id = datos.id != null ? String(datos.id) : null;
  const clave = typeof datos.clave_acceso === "string" ? datos.clave_acceso : null;

  if (estado === "AUTORIZADO" && clave) {
    const fecha = typeof autorizacion.fecha === "string" ? new Date(autorizacion.fecha) : null;
    return {
      estado: "AUTORIZADA",
      numero: numero ?? String(datos.secuencial ?? ""),
      codigo: clave,
      qr: null,
      publicUrl: null,
      providerId: id,
      fecha: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null,
    };
  }
  if (estado === "NO AUTORIZADO" || estado === "DEVUELTO" || estado === "ERROR") {
    const envio = (datos.envio_sri ?? {}) as Record<string, unknown>;
    const detalle = juntarMensajes([autorizacion.mensajes, envio.mensajes]);
    return { estado: "RECHAZADA", mensaje: "El SRI no autorizó la factura" + (detalle ? ": " + detalle : ".") };
  }
  return { estado: "ENVIANDO", numero, codigo: clave, providerId: id, mensaje: null };
}

async function pedir(c: CredencialesDatil, metodo: "GET" | "POST", ruta: string, cuerpo?: unknown) {
  let r: Response;
  try {
    r = await fetch(base() + ruta, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        "X-Key": c.apiKey,
        ...(metodo === "POST" ? { "X-Password": c.certPassword } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
  } catch {
    return null;
  }
  const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, datos };
}

function fallaHttp(status: number, datos: Record<string, unknown>): ResultadoProveedor {
  if (status >= 500) return { estado: "ERROR", mensaje: "Dátil no respondió (" + status + "). Se reintenta sola." };
  if (status === 401 || status === 403) return { estado: "RECHAZADA", mensaje: "Dátil no aceptó la clave del API o la clave de la firma electrónica." };
  const detalle = juntarMensajes(datos.errors ?? datos.message ?? datos.error ?? datos);
  return { estado: "RECHAZADA", mensaje: "Dátil rechazó la factura" + (detalle ? ": " + detalle : ".") };
}

export async function emitirDatil(c: CredencialesDatil, ambiente: Ambiente, d: DatosFacturaDatil): Promise<ResultadoProveedor> {
  const r = await pedir(c, "POST", "/invoices/issue", cuerpoDatil(ambiente, d));
  if (!r) return { estado: "ERROR", mensaje: "No se pudo conectar con Dátil. Se reintenta sola." };
  if (r.status >= 400) return fallaHttp(r.status, r.datos);
  return leerRespuesta(r.datos, numeroSri(d.emisor.establecimiento, d.emisor.puntoEmision, d.secuencial));
}

export async function consultarDatil(c: CredencialesDatil, id: string, numero: string | null): Promise<ResultadoProveedor> {
  const r = await pedir(c, "GET", "/invoices/" + encodeURIComponent(id));
  if (!r) return { estado: "ERROR", mensaje: "No se pudo conectar con Dátil." };
  if (r.status >= 400) return fallaHttp(r.status, r.datos);
  return leerRespuesta(r.datos, numero);
}

/**
 * Prueba la clave del API. Datil no tiene un "hola": se pide una factura que no
 * existe. Con la clave buena responde que no la encontro; con una mala, que no
 * esta autorizado.
 */
export async function probarDatil(c: CredencialesDatil): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const r = await pedir(c, "GET", "/invoices/prueba-de-conexion-todoen1");
  if (!r) return { ok: false, mensaje: "No se pudo conectar con Dátil." };
  if (r.status === 401 || r.status === 403) return { ok: false, mensaje: "Dátil no aceptó la clave del API." };
  if (r.status >= 500) return { ok: false, mensaje: "Dátil no respondió (" + r.status + ")." };
  return { ok: true };
}
