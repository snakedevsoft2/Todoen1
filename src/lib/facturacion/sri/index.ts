import type { BillingConfig } from "@prisma/client";
import type { LineaFiscal } from "../impuestos";
import type { Comprador } from "../paises";
import type { Ambiente, ResultadoProveedor } from "../tipos";
import { claveAcceso } from "./clave";
import { abrirFirma, datosFirma, firmarComprobante, problemaDeFirma, type DatosFirma } from "./firma";
import { autorizacionSri, enviarAlSri, textoMensajes } from "./ws";
import { CONSUMIDOR_FINAL, facturaXml, type CompradorSri, type EmisorSri, type LineaSri, type Regimen } from "./xml";

/**
 * Factura electronica directa con el SRI, sin intermediario: la app arma el
 * XML, lo firma con la firma .p12 del negocio, lo manda y pregunta por la
 * autorizacion. Por ahora solo la usa Chopo Snacks (ver esChopoSnacks).
 *
 * La firma y su clave se guardan cifradas con las demas credenciales (ver
 * cifrado.ts); aqui llegan ya leidas.
 */

export type CredencialesSri = {
  /** El archivo .p12 en base64. */
  p12: string;
  p12Password: string;
  firmaTitular?: string;
  firmaEmisor?: string;
  /** "YYYY-MM-DD". */
  firmaVence?: string;
};

export function credencialesSriCompletas(c: Record<string, string> | null): c is CredencialesSri {
  return Boolean(c?.p12 && c?.p12Password);
}

/** Abre la firma que se va a guardar y dice de quien es; si no sirve, por que. */
export function revisarFirma(p12Base64: string, clave: string): { ok: true; datos: DatosFirma } | { ok: false; error: string } {
  try {
    const firma = abrirFirma(Buffer.from(p12Base64, "base64"), clave);
    const problema = problemaDeFirma(firma);
    return problema ? { ok: false, error: problema } : { ok: true, datos: datosFirma(firma) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo abrir la firma electrónica." };
  }
}

const REGIMENES: Regimen[] = ["GENERAL", "RIMPE_EMPRENDEDOR", "RIMPE_NEGOCIO_POPULAR"];
export const esRegimen = (v: unknown): v is Regimen => REGIMENES.includes(v as Regimen);

export function emisorDe(c: BillingConfig): EmisorSri {
  return {
    ruc: c.taxId ?? "",
    razonSocial: c.legalName ?? "",
    nombreComercial: c.tradeName,
    dirMatriz: c.fiscalAddress ?? "",
    dirEstablecimiento: c.branchAddress || c.fiscalAddress || "",
    establecimiento: c.establishment,
    puntoEmision: c.emissionPoint,
    obligadoContabilidad: c.keepsAccounting,
    contribuyenteEspecial: c.specialTaxpayer,
    agenteRetencion: c.withholdingAgent,
    regimen: esRegimen(c.taxRegime) ? c.taxRegime : "GENERAL",
  };
}

export function compradorSri(c: Comprador): CompradorSri {
  const contacto = { correo: c.correo || null, telefono: c.telefono || null, direccion: c.direccion || null };
  return c.consumidorFinal
    ? { ...CONSUMIDOR_FINAL, ...contacto }
    : { tipoIdentificacion: c.tipoDocumento, identificacion: c.numero, razonSocial: c.nombre, ...contacto };
}

/** Tabla 24 del SRI, por como se pago en la caja. */
const FORMA_PAGO: Record<string, string> = { EFECTIVO: "01", TARJETA: "19", TRANSFERENCIA: "20" };

export type FacturaDeVenta = {
  ambiente: Ambiente;
  /** "YYYY-MM-DD" en Ecuador. */
  fecha: string;
  secuencial: number;
  comprador: Comprador;
  lineas: LineaFiscal[];
  tarifa: number;
  metodoPago: string;
};

/**
 * Arma y firma la factura de una venta. Devuelve el XML firmado y su clave de
 * acceso. Lo que impide armarla (firma vencida o con otra clave, RUC mal
 * escrito) sale como NoSeArma: reintentar solo no lo arregla.
 */
export function firmarFacturaDeVenta(config: BillingConfig, creds: CredencialesSri, d: FacturaDeVenta): { xml: string; clave: string } {
  try {
    return armarYFirmar(config, creds, d);
  } catch (e) {
    throw new NoSeArma(e instanceof Error ? e.message : "No se pudo armar la factura.");
  }
}

function armarYFirmar(config: BillingConfig, creds: CredencialesSri, d: FacturaDeVenta): { xml: string; clave: string } {
  const firma = abrirFirma(Buffer.from(creds.p12, "base64"), creds.p12Password);
  const problema = problemaDeFirma(firma);
  if (problema) throw new Error(problema);
  const emisor = emisorDe(config);
  const clave = claveAcceso({
    fecha: d.fecha,
    tipo: "01",
    ruc: emisor.ruc,
    ambiente: d.ambiente,
    establecimiento: emisor.establecimiento,
    puntoEmision: emisor.puntoEmision,
    secuencial: d.secuencial,
  });
  const lineas: LineaSri[] = d.lineas.map((l, i) => ({
    codigo: "ITEM" + (i + 1),
    descripcion: l.nombre,
    cantidad: l.cantidad,
    precioUnitario: l.precioNeto,
    descuento: 0,
    base: l.base,
    tarifa: d.tarifa,
    iva: l.impuesto,
  }));
  const total = lineas.reduce((s, l) => s + l.base + l.iva, 0);
  const xml = facturaXml({
    ambiente: d.ambiente,
    tipo: "01",
    secuencial: d.secuencial,
    clave,
    emisor,
    fecha: d.fecha,
    comprador: compradorSri(d.comprador),
    lineas,
    pagos: [{ formaPago: FORMA_PAGO[d.metodoPago] ?? "01", total }],
  });
  return { xml: firmarComprobante(xml, firma), clave };
}

/** La factura no se pudo armar ni firmar: no se manda y se dice por que. */
export class NoSeArma extends Error {}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cuanto se espera, despues de mandarla, a que el SRI la autorice antes de dejarla "enviando". */
const ESPERAS_AUTORIZACION = process.env.NODE_ENV === "test" ? [10, 10] : [1_500, 3_000];

/**
 * Manda un comprobante firmado y pregunta por la autorizacion.
 *
 * Si ya se habia mandado (`yaEnviado`), primero pregunta: si el SRI ya lo
 * tiene no se manda otra vez. Un rechazo por clave ya registrada (43) o en
 * proceso (70) quiere decir que llego antes, y se sigue con la consulta.
 */
export async function despacharSri(
  ambiente: Ambiente,
  clave: string,
  xmlFirmado: string,
  numero: string,
  yaEnviado: boolean
): Promise<ResultadoProveedor & { xml?: string | null }> {
  let a = yaEnviado ? await autorizacionSri(ambiente, clave) : null;
  if (!a || a.estado === "SIN REGISTRO") {
    const r = await enviarAlSri(ambiente, xmlFirmado);
    if (r.estado === "DEVUELTA" && !r.mensajes.some((m) => m.identificador === "43" || m.identificador === "70")) {
      return { estado: "RECHAZADA", mensaje: "El SRI la devolvió: " + textoMensajes(r.mensajes) };
    }
    for (const ms of ESPERAS_AUTORIZACION) {
      await dormir(ms);
      a = await autorizacionSri(ambiente, clave);
      if (a.estado === "AUTORIZADO" || a.estado === "NO AUTORIZADO") break;
    }
  }
  if (a?.estado === "AUTORIZADO") {
    return { estado: "AUTORIZADA", numero, codigo: clave, qr: null, publicUrl: null, providerId: null, fecha: a.fecha, xml: a.xml };
  }
  if (a?.estado === "NO AUTORIZADO") {
    return { estado: "RECHAZADA", mensaje: "El SRI no la autorizó: " + textoMensajes(a.mensajes) };
  }
  return { estado: "ENVIANDO", numero, codigo: clave, providerId: null, mensaje: "Recibida por el SRI. Esperando la autorización." };
}

/** Para "Probar conexión": la firma sirve y el SRI contesta. */
export async function probarSri(creds: CredencialesSri, ambiente: Ambiente): Promise<{ ok: boolean; mensaje: string }> {
  const firma = revisarFirma(creds.p12, creds.p12Password);
  if (!firma.ok) return { ok: false, mensaje: firma.error };
  const vence = firma.datos.hasta.toISOString().slice(0, 10).split("-").reverse().join("/");
  try {
    // Una clave que no existe: si contesta "sin registro", el SRI esta al otro lado.
    await autorizacionSri(ambiente, "0".repeat(49));
    return {
      ok: true,
      mensaje: "Firma de " + firma.datos.titular + " vigente hasta el " + vence + ". El SRI (" + ambiente + ") responde.",
    };
  } catch (e) {
    return { ok: false, mensaje: "La firma sirve, pero no se pudo hablar con el SRI: " + (e instanceof Error ? e.message : "sin respuesta") };
  }
}
