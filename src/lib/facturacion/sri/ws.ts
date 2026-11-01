import { ESPERA_MS } from "../tipos";

/**
 * Los dos servicios web del SRI, esquema offline: recepcion (se manda el XML
 * firmado) y autorizacion (se pregunta por la clave de acceso).
 *
 * Son SOAP, pero sencillos: un sobre con un solo campo de ida y una respuesta
 * con estado y mensajes. Se escriben y se leen a mano para no cargar una
 * libreria SOAP por dos llamadas.
 *
 * SRI_BASE_URL reemplaza la direccion del SRI (las pruebas usan un SRI de
 * mentira): <base>/pruebas/... y <base>/produccion/...
 */

const DIRECCION = {
  pruebas: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/",
  produccion: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/",
};

export type AmbienteSri = keyof typeof DIRECCION;

function direccion(ambiente: AmbienteSri): string {
  const otra = process.env.SRI_BASE_URL;
  return otra ? otra.replace(/\/?$/, "/") + ambiente + "/" : DIRECCION[ambiente];
}

export type MensajeSri = { identificador: string; mensaje: string; informacionAdicional: string | null; tipo: string };

const desescapar = (v: string) =>
  v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const etiqueta = (xml: string, nombre: string): string | null => {
  const m = new RegExp("<" + nombre + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + nombre + ">").exec(xml);
  return m ? m[1].trim() : null;
};

function leerMensajes(xml: string): MensajeSri[] {
  const patron =
    /<identificador>([^<]*)<\/identificador>\s*<mensaje>([^<]*)<\/mensaje>\s*(?:<informacionAdicional>([^<]*)<\/informacionAdicional>\s*)?<tipo>([^<]*)<\/tipo>/g;
  return [...xml.matchAll(patron)].map((m) => ({
    identificador: m[1].trim(),
    mensaje: desescapar(m[2].trim()),
    informacionAdicional: m[3] ? desescapar(m[3].trim()) : null,
    tipo: m[4].trim(),
  }));
}

/** Los mensajes en una frase, para guardarla y mostrarla. */
export function textoMensajes(mensajes: MensajeSri[]): string {
  return mensajes
    .map((m) => m.identificador + " " + m.mensaje + (m.informacionAdicional ? ": " + m.informacionAdicional : ""))
    .join(" · ")
    .slice(0, 900);
}

async function soap(url: string, cuerpo: string): Promise<string> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: cuerpo,
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  const texto = await r.text();
  if (!texto.includes("Envelope")) throw new Error("El SRI no respondió bien (" + r.status + "). Se reintenta.");
  return texto;
}

export type Recepcion = { estado: "RECIBIDA" | "DEVUELTA"; mensajes: MensajeSri[] };

/** Manda el comprobante firmado. RECIBIDA no es autorizada: falta preguntar. */
export async function enviarAlSri(ambiente: AmbienteSri, xmlFirmado: string): Promise<Recepcion> {
  const sobre =
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">' +
    "<soapenv:Header/><soapenv:Body><ec:validarComprobante><xml>" +
    Buffer.from(xmlFirmado, "utf8").toString("base64") +
    "</xml></ec:validarComprobante></soapenv:Body></soapenv:Envelope>";
  const respuesta = await soap(direccion(ambiente) + "RecepcionComprobantesOffline", sobre);
  const estado = etiqueta(respuesta, "estado");
  if (estado !== "RECIBIDA" && estado !== "DEVUELTA") throw new Error("El SRI respondió sin estado. Se reintenta.");
  return { estado, mensajes: leerMensajes(respuesta) };
}

export type Autorizacion = {
  estado: "AUTORIZADO" | "NO AUTORIZADO" | "EN PROCESO" | "SIN REGISTRO";
  numero: string | null;
  fecha: Date | null;
  /** El XML autorizado como se le entrega al comprador: <autorizacion> con el comprobante dentro. */
  xml: string | null;
  mensajes: MensajeSri[];
};

/** Pregunta como va un comprobante. SIN REGISTRO: el SRI no lo tiene (no llego). */
export async function autorizacionSri(ambiente: AmbienteSri, clave: string): Promise<Autorizacion> {
  const sobre =
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">' +
    "<soapenv:Header/><soapenv:Body><ec:autorizacionComprobante><claveAccesoComprobante>" +
    clave +
    "</claveAccesoComprobante></ec:autorizacionComprobante></soapenv:Body></soapenv:Envelope>";
  const respuesta = await soap(direccion(ambiente) + "AutorizacionComprobantesOffline", sobre);
  const bloques = [...respuesta.matchAll(/<autorizacion>([\s\S]*?)<\/autorizacion>/g)].map((m) => m[1]);
  if (bloques.length === 0) return { estado: "SIN REGISTRO", numero: null, fecha: null, xml: null, mensajes: [] };

  // Si se mando mas de una vez, vale la autorizada.
  const bloque = bloques.find((b) => etiqueta(b, "estado") === "AUTORIZADO") ?? bloques[0];
  const estado = etiqueta(bloque, "estado");
  const mensajes = leerMensajes(bloque);
  if (estado === "AUTORIZADO") {
    const numero = etiqueta(bloque, "numeroAutorizacion");
    const fechaTexto = etiqueta(bloque, "fechaAutorizacion");
    const crudo = etiqueta(bloque, "comprobante") ?? "";
    const comprobante = crudo.startsWith("<![CDATA[") ? crudo.slice(9, -3) : desescapar(crudo);
    const fecha = fechaTexto ? new Date(fechaTexto) : null;
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><autorizacion>' +
      "<estado>AUTORIZADO</estado><numeroAutorizacion>" + (numero ?? clave) + "</numeroAutorizacion>" +
      "<fechaAutorizacion>" + (fechaTexto ?? "") + "</fechaAutorizacion>" +
      "<ambiente>" + (ambiente === "produccion" ? "PRODUCCIÓN" : "PRUEBAS") + "</ambiente>" +
      "<comprobante><![CDATA[" + comprobante + "]]></comprobante></autorizacion>";
    return { estado, numero: numero ?? clave, fecha: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null, xml, mensajes };
  }
  if (estado === "NO AUTORIZADO") return { estado, numero: null, fecha: null, xml: null, mensajes };
  return { estado: "EN PROCESO", numero: null, fecha: null, xml: null, mensajes };
}
