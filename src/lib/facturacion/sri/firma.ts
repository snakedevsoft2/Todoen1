import { createHash, createSign, randomInt } from "node:crypto";
import forge from "node-forge";

/**
 * La firma XAdES-BES que pide el SRI, con la firma electronica (.p12) del
 * negocio. Es la del ejemplo de la ficha tecnica: RSA-SHA1, canonicalizacion
 * C14N y tres referencias (las propiedades firmadas, el certificado y el
 * comprobante entero).
 *
 * Cada parte se firma tal como queda escrita: los XML de xml.ts ya salen en
 * forma canonica, y aqui cada pedazo se escribe igual. A los pedazos que se
 * resumen por separado (SignedProperties, KeyInfo, SignedInfo) se les agregan
 * los espacios de nombres que heredan de ds:Signature, porque asi los ve la
 * canonicalizacion del SRI.
 */

const DS = "http://www.w3.org/2000/09/xmldsig#";
const ETSI = "http://uri.etsi.org/01903/v1.3.2#";
const XMLNS = 'xmlns:ds="' + DS + '" xmlns:etsi="' + ETSI + '"';

export type FirmaAbierta = {
  llave: forge.pki.rsa.PrivateKey;
  cert: forge.pki.Certificate;
};

export type DatosFirma = {
  /** A nombre de quien esta (CN del certificado). */
  titular: string;
  /** Quien la emitio: Banco Central, Security Data, ANF... */
  emisor: string;
  desde: Date;
  hasta: Date;
};

const nombreDe = (atributos: forge.pki.CertificateField[], campo: string) =>
  String(atributos.find((a) => a.shortName === campo || a.name === campo)?.value ?? "");

/**
 * Abre la firma. Algunas (las del Banco Central) traen varios certificados:
 * vale el que corresponde a la llave privada.
 */
export function abrirFirma(p12: Buffer, clave: string): FirmaAbierta {
  let contenedor: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12.toString("binary")));
    contenedor = forge.pkcs12.pkcs12FromAsn1(asn1, false, clave);
  } catch {
    throw new Error("No se pudo abrir la firma electrónica: revisa el archivo .p12 y su clave.");
  }
  const bolsas = (tipo: string) => contenedor.getBags({ bagType: tipo })[tipo] ?? [];
  const llaves = [...bolsas(forge.pki.oids.pkcs8ShroudedKeyBag), ...bolsas(forge.pki.oids.keyBag)]
    .map((b) => b.key as forge.pki.rsa.PrivateKey | undefined)
    .filter((k): k is forge.pki.rsa.PrivateKey => Boolean(k?.n));
  const certs = bolsas(forge.pki.oids.certBag)
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c));
  for (const llave of llaves) {
    const cert = certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n?.equals(llave.n));
    if (cert) return { llave, cert };
  }
  throw new Error("La firma electrónica no trae un certificado que corresponda a su llave.");
}

export function datosFirma(f: FirmaAbierta): DatosFirma {
  return {
    titular: nombreDe(f.cert.subject.attributes, "CN"),
    emisor: nombreDe(f.cert.issuer.attributes, "CN") || nombreDe(f.cert.issuer.attributes, "O"),
    desde: f.cert.validity.notBefore,
    hasta: f.cert.validity.notAfter,
  };
}

/** Por que no se puede firmar con ella hoy, o nulo si se puede. */
export function problemaDeFirma(f: FirmaAbierta, ahora = new Date()): string | null {
  const d = datosFirma(f);
  if (ahora < d.desde) return "La firma electrónica todavía no está vigente.";
  if (ahora > d.hasta) return "La firma electrónica venció el " + d.hasta.toISOString().slice(0, 10).split("-").reverse().join("/") + ". Renuévala y vuelve a subirla.";
  return null;
}

const sha1 = (datos: string | Buffer) => createHash("sha1").update(datos).digest("base64");

function enteroBase64(n: forge.jsbn.BigInteger): string {
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return Buffer.from(hex, "hex").toString("base64");
}

/** "CN=...,OU=...,O=...,C=EC": del mas especifico al mas general. */
function nombreEmisor(cert: forge.pki.Certificate): string {
  return cert.issuer.attributes
    .slice()
    .reverse()
    .map((a) => (a.shortName ?? a.name ?? a.type) + "=" + String(a.value))
    .join(",");
}

/** La hora en Ecuador continental, que no cambia de horario: 2026-10-31T17:05:22-05:00. */
function horaEcuador(ahora: Date): string {
  return new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 19) + "-05:00";
}

const escapar = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Firma un comprobante (el XML de xml.ts, con su declaracion) y devuelve el
 * XML firmado, con la firma como ultimo hijo del comprobante.
 */
export function firmarComprobante(xml: string, f: FirmaAbierta, ahora = new Date()): string {
  const declaracion = /^<\?xml[^>]*\?>/.exec(xml)?.[0] ?? "";
  const comprobante = xml.slice(declaracion.length);
  const cierre = /<\/([A-Za-z]+)>$/.exec(comprobante);
  if (!cierre) throw new Error("El comprobante no está bien formado.");

  const n = () => String(randomInt(100_000, 999_999));
  const id = { firma: n(), propiedades: n(), info: n(), referencia: n(), certificado: n(), valor: n(), objeto: n(), refPropiedades: n() };

  const certDer = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(f.cert)).getBytes(), "binary");
  const certB64 = certDer.toString("base64");
  const serie = BigInt("0x" + f.cert.serialNumber).toString();
  const digestMetodo = '<ds:DigestMethod Algorithm="' + DS + 'sha1"></ds:DigestMethod>';

  const propiedades =
    '<etsi:SignedProperties Id="Signature' + id.firma + "-SignedProperties" + id.propiedades + '">' +
    "<etsi:SignedSignatureProperties>" +
    "<etsi:SigningTime>" + horaEcuador(ahora) + "</etsi:SigningTime>" +
    "<etsi:SigningCertificate><etsi:Cert><etsi:CertDigest>" + digestMetodo +
    "<ds:DigestValue>" + sha1(certDer) + "</ds:DigestValue></etsi:CertDigest>" +
    "<etsi:IssuerSerial><ds:X509IssuerName>" + escapar(nombreEmisor(f.cert)) + "</ds:X509IssuerName>" +
    "<ds:X509SerialNumber>" + serie + "</ds:X509SerialNumber></etsi:IssuerSerial>" +
    "</etsi:Cert></etsi:SigningCertificate>" +
    "</etsi:SignedSignatureProperties>" +
    "<etsi:SignedDataObjectProperties>" +
    '<etsi:DataObjectFormat ObjectReference="#Reference-ID-' + id.referencia + '">' +
    "<etsi:Description>contenido comprobante</etsi:Description><etsi:MimeType>text/xml</etsi:MimeType>" +
    "</etsi:DataObjectFormat></etsi:SignedDataObjectProperties>" +
    "</etsi:SignedProperties>";

  const infoLlave =
    '<ds:KeyInfo Id="Certificate' + id.certificado + '">' +
    "<ds:X509Data><ds:X509Certificate>" + certB64 + "</ds:X509Certificate></ds:X509Data>" +
    "<ds:KeyValue><ds:RSAKeyValue><ds:Modulus>" + enteroBase64(f.llave.n) + "</ds:Modulus>" +
    "<ds:Exponent>" + enteroBase64(f.llave.e) + "</ds:Exponent></ds:RSAKeyValue></ds:KeyValue>" +
    "</ds:KeyInfo>";

  const conEspacios = (parte: string, etiqueta: string) => parte.replace("<" + etiqueta, "<" + etiqueta + " " + XMLNS);

  const infoFirmada =
    '<ds:SignedInfo Id="Signature-SignedInfo' + id.info + '">' +
    '<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>' +
    '<ds:SignatureMethod Algorithm="' + DS + 'rsa-sha1"></ds:SignatureMethod>' +
    '<ds:Reference Id="SignedPropertiesID' + id.refPropiedades + '" Type="http://uri.etsi.org/01903#SignedProperties" URI="#Signature' + id.firma + "-SignedProperties" + id.propiedades + '">' +
    digestMetodo + "<ds:DigestValue>" + sha1(conEspacios(propiedades, "etsi:SignedProperties")) + "</ds:DigestValue></ds:Reference>" +
    '<ds:Reference URI="#Certificate' + id.certificado + '">' +
    digestMetodo + "<ds:DigestValue>" + sha1(conEspacios(infoLlave, "ds:KeyInfo")) + "</ds:DigestValue></ds:Reference>" +
    '<ds:Reference Id="Reference-ID-' + id.referencia + '" URI="#comprobante">' +
    '<ds:Transforms><ds:Transform Algorithm="' + DS + 'enveloped-signature"></ds:Transform></ds:Transforms>' +
    digestMetodo + "<ds:DigestValue>" + sha1(comprobante) + "</ds:DigestValue></ds:Reference>" +
    "</ds:SignedInfo>";

  const valor = createSign("RSA-SHA1")
    .update(conEspacios(infoFirmada, "ds:SignedInfo"), "utf8")
    .sign(forge.pki.privateKeyToPem(f.llave), "base64");

  const firma =
    "<ds:Signature " + XMLNS + ' Id="Signature' + id.firma + '">' +
    infoFirmada +
    '<ds:SignatureValue Id="SignatureValue' + id.valor + '">' + valor + "</ds:SignatureValue>" +
    infoLlave +
    '<ds:Object Id="Signature' + id.firma + "-Object" + id.objeto + '">' +
    '<etsi:QualifyingProperties Target="#Signature' + id.firma + '">' + propiedades + "</etsi:QualifyingProperties>" +
    "</ds:Object>" +
    "</ds:Signature>";

  return declaracion + comprobante.slice(0, cierre.index) + firma + cierre[0];
}
