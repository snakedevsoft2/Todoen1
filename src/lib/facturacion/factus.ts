import type { LineaFiscal, Totales } from "./impuestos";
import { digitoVerificacion, type Comprador } from "./paises";
import { ESPERA_MS, juntarMensajes, type Ambiente, type ResultadoProveedor } from "./tipos";

/**
 * Factura electronica de Colombia (DIAN) con la API v2 de Factus.
 *
 * Cada negocio usa su propia cuenta de Factus: el rango de numeracion, la
 * resolucion y los datos del emisor viven alla. Aqui solo se manda la venta.
 *
 * Documentacion: https://developers.factus.com.co (autenticacion OAuth2 con
 * usuario y clave, POST /v2/bills/validate). Los precios van SIN impuesto: la
 * DIAN calcula el IVA encima.
 */

export type CredencialesFactus = { clientId: string; clientSecret: string; username: string; password: string };

export function credencialesFactusCompletas(c: Record<string, string> | null): c is CredencialesFactus {
  return Boolean(c?.clientId && c?.clientSecret && c?.username && c?.password);
}

function base(ambiente: Ambiente): string {
  if (process.env.FACTUS_BASE_URL) return process.env.FACTUS_BASE_URL.replace(/\/$/, "");
  return ambiente === "produccion" ? "https://api.factus.com.co" : "https://api-sandbox.factus.com.co";
}

class SinConexion extends Error {}
class CredencialesMalas extends Error {}

/** El token dura unos minutos: se guarda para no pedir uno por factura. */
const tokens = new Map<string, { token: string; vence: number }>();

async function token(c: CredencialesFactus, ambiente: Ambiente, renovar = false): Promise<string> {
  const clave = base(ambiente) + "|" + c.clientId + "|" + c.username;
  const guardado = tokens.get(clave);
  if (!renovar && guardado && guardado.vence > Date.now()) return guardado.token;

  let r: Response;
  try {
    r = await fetch(base(ambiente) + "/oauth/token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: c.clientId,
        client_secret: c.clientSecret,
        username: c.username,
        password: c.password,
      }),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
  } catch {
    throw new SinConexion("No se pudo conectar con Factus.");
  }
  if (r.status >= 500) throw new SinConexion("Factus no respondió (" + r.status + ").");
  const datos = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!r.ok || !datos.access_token) throw new CredencialesMalas("Factus no aceptó las credenciales. Revisa el client id, el secreto, el usuario y la clave.");
  // Se renueva un poco antes de que venza, para no quedarse a mitad de una factura.
  tokens.set(clave, { token: datos.access_token, vence: Date.now() + Math.max(30, (datos.expires_in ?? 600) - 60) * 1000 });
  return datos.access_token;
}

async function pedir(
  c: CredencialesFactus,
  ambiente: Ambiente,
  metodo: "GET" | "POST",
  ruta: string,
  cuerpo?: unknown
): Promise<{ status: number; datos: Record<string, unknown> }> {
  for (let intento = 0; intento < 2; intento++) {
    const t = await token(c, ambiente, intento > 0);
    let r: Response;
    try {
      r = await fetch(base(ambiente) + ruta, {
        method: metodo,
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(ESPERA_MS),
      });
    } catch {
      throw new SinConexion("No se pudo conectar con Factus.");
    }
    // Token vencido antes de tiempo: se pide otro una vez.
    if (r.status === 401 && intento === 0) continue;
    const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: r.status, datos };
  }
  throw new CredencialesMalas("Factus no aceptó las credenciales.");
}

export type DatosFacturaFactus = {
  /** Unico por venta: si se reintenta, Factus reconoce que ya la tenia. */
  referencia: string;
  rangoId: string | null;
  comprador: Comprador;
  lineas: LineaFiscal[];
  totales: Totales;
  codigoImpuesto: string;
  tarifa: number;
  metodoPago: string;
  observacion: string | null;
};

/** Codigos de metodo de pago de la DIAN. */
const METODO_PAGO: Record<string, string> = { EFECTIVO: "10", TARJETA: "48", TRANSFERENCIA: "47", OTRO: "ZZZ" };

const dos = (n: number) => n.toFixed(2);

export function cuerpoFactus(d: DatosFacturaFactus): Record<string, unknown> {
  const c = d.comprador;
  const contacto = {
    ...(c.correo ? { email: c.correo } : {}),
    ...(c.telefono ? { phone: c.telefono } : {}),
    ...(c.direccion ? { address: c.direccion } : {}),
  };
  const customer = c.consumidorFinal
    ? {
        // DIAN: quien no da sus datos se factura como "consumidor final" con el NIT 222222222222.
        identification_document_code: "31",
        identification: "222222222222",
        dv: digitoVerificacion("222222222222"),
        names: "Consumidor final",
        legal_organization_code: "2",
        tribute_code: "ZZ",
        country_code: "CO",
        ...contacto,
      }
    : {
        identification_document_code: c.tipoDocumento,
        identification: c.numero,
        ...(c.tipoDocumento === "31" ? { dv: digitoVerificacion(c.numero) } : {}),
        ...(c.esEmpresa ? { company: c.nombre, legal_organization_code: "1" } : { names: c.nombre, legal_organization_code: "2" }),
        tribute_code: "ZZ",
        country_code: "CO",
        ...contacto,
      };

  return {
    reference_code: d.referencia,
    document: "01",
    operation_type: "10",
    ...(d.rangoId ? { numbering_range_id: Number(d.rangoId) } : {}),
    send_email: Boolean(c.correo),
    ...(d.observacion ? { observation: d.observacion.slice(0, 500) } : {}),
    payment_details: [
      { payment_form: "1", payment_method_code: METODO_PAGO[d.metodoPago] ?? "ZZZ", amount: dos(d.totales.total) },
    ],
    customer,
    items: d.lineas.map((l, i) => ({
      code_reference: "ITEM-" + (i + 1),
      name: l.nombre.slice(0, 200),
      quantity: dos(l.cantidad),
      discount_rate: "0.00",
      price: dos(l.precioNeto),
      unit_measure_code: "94",
      standard_code: "999",
      taxes: [{ code: d.codigoImpuesto, rate: dos(d.tarifa) }],
    })),
  };
}

type Factura = Record<string, unknown> & { links?: Record<string, unknown> };

function leerFactura(f: Factura | undefined): ResultadoProveedor | null {
  if (!f || typeof f !== "object") return null;
  const numero = typeof f.number === "string" ? f.number : null;
  const cufe = typeof f.cufe === "string" && f.cufe ? f.cufe : null;
  const links = (f.links ?? {}) as Record<string, unknown>;
  const qr = typeof links.qr === "string" ? links.qr : typeof f.qr === "string" ? f.qr : null;
  const publicUrl = typeof links.public_url === "string" ? links.public_url : typeof f.public_url === "string" ? f.public_url : null;
  const validada = f.is_validated === true || f.status === 1 || f.status === "1";
  if (numero && cufe && (validada || f.is_validated === undefined)) {
    return { estado: "AUTORIZADA", numero, codigo: cufe, qr, publicUrl, providerId: f.id != null ? String(f.id) : null, fecha: null };
  }
  return { estado: "ENVIANDO", numero, codigo: cufe, providerId: f.id != null ? String(f.id) : null, mensaje: juntarMensajes(f.errors) || null };
}

/** Busca por el codigo de referencia la factura que ya se habia mandado. */
export async function consultarFactus(c: CredencialesFactus, ambiente: Ambiente, referencia: string): Promise<ResultadoProveedor | null> {
  try {
    const { status, datos } = await pedir(c, ambiente, "GET", "/v2/bills?filter[reference_code]=" + encodeURIComponent(referencia));
    if (status >= 500) return { estado: "ERROR", mensaje: "Factus no respondió (" + status + ")." };
    const contenedor = datos.data as Record<string, unknown> | unknown[] | undefined;
    const lista = Array.isArray(contenedor) ? contenedor : Array.isArray((contenedor as Record<string, unknown>)?.data) ? ((contenedor as Record<string, unknown>).data as unknown[]) : [];
    const encontrada = (lista as Factura[]).find((f) => f.reference_code === referencia);
    return encontrada ? leerFactura(encontrada) : null;
  } catch (e) {
    if (e instanceof CredencialesMalas) return { estado: "RECHAZADA", mensaje: e.message };
    return { estado: "ERROR", mensaje: e instanceof Error ? e.message : "No se pudo consultar en Factus." };
  }
}

export async function emitirFactus(c: CredencialesFactus, ambiente: Ambiente, d: DatosFacturaFactus): Promise<ResultadoProveedor> {
  try {
    const { status, datos } = await pedir(c, ambiente, "POST", "/v2/bills/validate", cuerpoFactus(d));
    if (status >= 500) return { estado: "ERROR", mensaje: "Factus no respondió (" + status + "). Se reintenta sola." };
    if (status === 409) {
      // Ya la tenia: una subida anterior llego y la respuesta se perdio.
      return (await consultarFactus(c, ambiente, d.referencia)) ?? { estado: "ERROR", mensaje: "Factus dice que ya tiene esta factura, pero no la encontró." };
    }
    if (status >= 400) {
      const detalle = juntarMensajes((datos.data as Record<string, unknown> | undefined)?.errors ?? datos.errors ?? datos.data);
      return { estado: "RECHAZADA", mensaje: [typeof datos.message === "string" ? datos.message : "Factus rechazó la factura.", detalle].filter(Boolean).join(" ") };
    }
    const datosFactura = datos.data as Record<string, unknown> | undefined;
    const factura = (datosFactura?.bill ?? datosFactura) as Factura | undefined;
    return leerFactura(factura) ?? { estado: "ERROR", mensaje: "Factus respondió sin los datos de la factura." };
  } catch (e) {
    if (e instanceof CredencialesMalas) return { estado: "RECHAZADA", mensaje: e.message };
    return { estado: "ERROR", mensaje: e instanceof Error ? e.message : "No se pudo conectar con Factus." };
  }
}

export type RangoFactus = { id: string; prefijo: string; desde: number; hasta: number; actual: number; resolucion: string; documento: string; vence: string | null };

/** Prueba las credenciales y trae los rangos de numeracion activos. */
export async function probarFactus(c: CredencialesFactus, ambiente: Ambiente): Promise<{ ok: true; rangos: RangoFactus[] } | { ok: false; mensaje: string }> {
  try {
    const { status, datos } = await pedir(c, ambiente, "GET", "/v2/numbering-ranges?filter[is_active]=1");
    if (status >= 400) return { ok: false, mensaje: "Factus respondió " + status + ": " + (juntarMensajes(datos.message ?? datos) || "sin detalle") };
    const contenedor = datos.data as Record<string, unknown> | unknown[] | undefined;
    const lista = (Array.isArray(contenedor) ? contenedor : ((contenedor as Record<string, unknown>)?.data as unknown[]) ?? []) as Record<string, unknown>[];
    return {
      ok: true,
      rangos: lista.map((r) => ({
        id: String(r.id ?? ""),
        prefijo: String(r.prefix ?? ""),
        desde: Number(r.from ?? 0),
        hasta: Number(r.to ?? 0),
        actual: Number(r.current ?? 0),
        resolucion: String(r.resolution_number ?? ""),
        documento: String(r.document ?? ""),
        vence: typeof r.end_date === "string" ? r.end_date : null,
      })),
    };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo conectar con Factus." };
  }
}

/** El PDF oficial de Factus, en base64. */
export async function pdfFactus(c: CredencialesFactus, ambiente: Ambiente, numero: string): Promise<{ nombre: string; base64: string } | null> {
  try {
    const { status, datos } = await pedir(c, ambiente, "GET", "/v2/bills/" + encodeURIComponent(numero) + "/download-pdf");
    const d = datos.data as Record<string, unknown> | undefined;
    if (status >= 400 || typeof d?.pdf_base_64_encoded !== "string") return null;
    return { nombre: String(d.file_name ?? numero), base64: d.pdf_base_64_encoded };
  } catch {
    return null;
  }
}
