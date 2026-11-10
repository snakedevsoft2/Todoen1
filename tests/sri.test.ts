import { generateKeyPairSync } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import forge from "node-forge";
import { configuracionFacturacion, emitirFactura, guardarConfiguracion, reintentarFacturas } from "../src/lib/facturacion";
import { descifrar } from "../src/lib/facturacion/cifrado";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { claveAcceso, claveValida, digitoModulo11 } from "../src/lib/facturacion/sri/clave";
import { abrirFirma, datosFirma, firmarComprobante, problemaDeFirma } from "../src/lib/facturacion/sri/firma";
import { CONSUMIDOR_FINAL, dec6, facturaXml, type EmisorSri, type FacturaSri } from "../src/lib/facturacion/sri/xml";
import { conPista, emisorDe, resolucionSri } from "../src/lib/facturacion/sri";
import type { BillingConfig } from "@prisma/client";

/**
 * Factura electronica directa con el SRI (Chopo Snacks): la clave de acceso,
 * el XML y la firma XAdES-BES. La firma se comprueba con xml-crypto, que la
 * verifica por su cuenta (canonicaliza y resume cada referencia), no con el
 * mismo codigo que la hizo.
 */

/** Una firma .p12 de prueba, firmada por una "entidad" de mentira, como las del Banco Central. */
export function firmaDePrueba(clave = "clave-de-la-firma", vence = new Date(Date.now() + 365 * 86_400_000)) {
  const par = () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const llave = forge.pki.privateKeyFromPem(privateKey.export({ type: "pkcs1", format: "pem" }).toString()) as forge.pki.rsa.PrivateKey;
    return { llave, publica: forge.pki.setRsaPublicKey(llave.n, llave.e) };
  };
  const entidad = par();
  const titular = par();
  const ca = forge.pki.createCertificate();
  ca.publicKey = entidad.publica;
  ca.serialNumber = "01";
  ca.validity.notBefore = new Date(Date.now() - 86_400_000);
  ca.validity.notAfter = new Date(Date.now() + 3650 * 86_400_000);
  const nombreCa = [
    { shortName: "C", value: "EC" },
    { shortName: "O", value: "ENTIDAD DE PRUEBA S.A." },
    { shortName: "CN", value: "AUTORIDAD DE CERTIFICACION DE PRUEBA" },
  ];
  ca.setSubject(nombreCa);
  ca.setIssuer(nombreCa);
  ca.sign(entidad.llave, forge.md.sha256.create());

  const cert = forge.pki.createCertificate();
  cert.publicKey = titular.publica;
  // Una serie larga: con Number() perderia digitos.
  cert.serialNumber = "7d3a9f00c1b2e4a5968778695a4b3c2d";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = vence;
  cert.setSubject([{ shortName: "C", value: "EC" }, { shortName: "CN", value: "JULIANA INTRIAGO" }]);
  cert.setIssuer(nombreCa);
  cert.sign(entidad.llave, forge.md.sha256.create());

  // La entidad va primero, como en las del Banco Central.
  const asn1 = forge.pkcs12.toPkcs12Asn1(titular.llave, [ca, cert], clave, { algorithm: "3des" });
  return { p12: Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary"), clave, certPem: forge.pki.certificateToPem(cert) };
}

export const EMISOR: EmisorSri = {
  ruc: "1790012345001",
  razonSocial: "CHOPO SNACKS & CIA. <PRUEBA>",
  nombreComercial: "Chopo Snacks",
  dirMatriz: "Av. Principal 123 y Secundaria",
  dirEstablecimiento: "Av. Principal 123 y Secundaria",
  establecimiento: "001",
  puntoEmision: "002",
  obligadoContabilidad: false,
  contribuyenteEspecial: null,
  agenteRetencion: null,
  regimen: "RIMPE_EMPRENDEDOR",
};

function factura(): FacturaSri {
  const clave = claveAcceso({ fecha: "2026-10-31", tipo: "01", ruc: EMISOR.ruc, ambiente: "pruebas", establecimiento: "001", puntoEmision: "002", secuencial: 123, codigoNumerico: "12345678" });
  return {
    ambiente: "pruebas",
    tipo: "01",
    secuencial: 123,
    clave,
    emisor: EMISOR,
    fecha: "2026-10-31",
    comprador: { tipoIdentificacion: "05", identificacion: "1712345678", razonSocial: "María José Ñúñez", direccion: "Calle 1", correo: "maria@correo.ec", telefono: "0991234567" },
    lineas: [
      { codigo: "P001", descripcion: "PAPA GRANDE NAT", cantidad: 10, precioUnitario: 0.695652, descuento: 0, base: 6.96, tarifa: 15, iva: 1.04 },
      { codigo: "P010", descripcion: "CHIFLE SAL\nLARGO", cantidad: 3, precioUnitario: 0.347826, descuento: 0, base: 1.04, tarifa: 15, iva: 0.16 },
    ],
    pagos: [{ formaPago: "01", total: 9.2 }],
  };
}

describe("la clave de acceso", () => {
  it("dígito verificador módulo 11, con el ejemplo de la ficha técnica (41261533 → 6)", () => {
    expect(digitoModulo11("41261533")).toBe(6);
  });

  it("49 dígitos en el orden de la ficha técnica, y se reconoce como válida", () => {
    const c = factura().clave;
    expect(c).toHaveLength(49);
    expect(c.slice(0, 8)).toBe("31102026");
    expect(c.slice(8, 10)).toBe("01");
    expect(c.slice(10, 23)).toBe(EMISOR.ruc);
    expect(c.slice(23, 24)).toBe("1");
    expect(c.slice(24, 30)).toBe("001002");
    expect(c.slice(30, 39)).toBe("000000123");
    expect(c.slice(39, 47)).toBe("12345678");
    expect(c.slice(47, 48)).toBe("1");
    expect(claveValida(c)).toBe(true);
    expect(claveValida(c.slice(0, 48) + ((Number(c[48]) + 1) % 10))).toBe(false);
  });

  it("un RUC que no es de 13 dígitos no arma clave", () => {
    expect(() => claveAcceso({ fecha: "2026-10-31", tipo: "01", ruc: "17900", ambiente: "pruebas", establecimiento: "001", puntoEmision: "001", secuencial: 1 })).toThrow();
  });
});

describe("el XML de la factura", () => {
  const xml = facturaXml(factura());

  it("en el orden del XSD 1.1.0, con totales a dos decimales y precios hasta seis", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.1.0"><infoTributaria><ambiente>1</ambiente><tipoEmision>1</tipoEmision>')).toBe(true);
    expect(xml).toContain("<codDoc>01</codDoc><estab>001</estab><ptoEmi>002</ptoEmi><secuencial>000000123</secuencial>");
    expect(xml).toContain("<contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe></infoTributaria>");
    expect(xml).toContain("<fechaEmision>31/10/2026</fechaEmision>");
    expect(xml).toContain("<obligadoContabilidad>NO</obligadoContabilidad><tipoIdentificacionComprador>05</tipoIdentificacionComprador>");
    expect(xml).toContain("<totalSinImpuestos>8.00</totalSinImpuestos><totalDescuento>0.00</totalDescuento>");
    expect(xml).toContain("<totalImpuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje><baseImponible>8.00</baseImponible><valor>1.20</valor></totalImpuesto>");
    expect(xml).toContain("<importeTotal>9.20</importeTotal><moneda>DOLAR</moneda><pagos><pago><formaPago>01</formaPago><total>9.20</total></pago></pagos>");
    expect(xml).toContain("<cantidad>10.00</cantidad><precioUnitario>0.695652</precioUnitario>");
    expect(xml).toContain('<campoAdicional nombre="Email">maria@correo.ec</campoAdicional>');
  });

  it("escapado y en una línea: & < > y saltos de línea no rompen el XML", () => {
    expect(xml).toContain("<razonSocial>CHOPO SNACKS &amp; CIA. &lt;PRUEBA&gt;</razonSocial>");
    expect(xml).toContain("<descripcion>CHIFLE SAL LARGO</descripcion>");
    expect(xml).not.toMatch(/\/>|>\s+</);
  });

  it("a consumidor final: 07 y trece nueves", () => {
    const x = facturaXml({ ...factura(), comprador: CONSUMIDOR_FINAL });
    expect(x).toContain("<tipoIdentificacionComprador>07</tipoIdentificacionComprador><razonSocialComprador>CONSUMIDOR FINAL</razonSocialComprador><identificacionComprador>9999999999999</identificacionComprador>");
    expect(x).not.toContain("infoAdicional");
  });

  it("seis decimales sin ceros de sobra", () => {
    expect(dec6(1)).toBe("1.00");
    expect(dec6(0.5)).toBe("0.50");
    expect(dec6(0.695652)).toBe("0.695652");
    expect(dec6(2.1234567)).toBe("2.123457");
  });
});

describe("contribuyente especial y agente de retención", () => {
  it("con NO, 0 o vacío en Ajustes no va la etiqueta (el SRI rechaza con error 98)", () => {
    for (const escrito of ["NO", "no", " 0 ", "000", "N/A", "", null]) expect(resolucionSri(escrito)).toBeNull();
    expect(resolucionSri(" 5368 ")).toBe("5368");

    const config = { taxId: EMISOR.ruc, establishment: "001", emissionPoint: "002", keepsAccounting: false, specialTaxpayer: "NO", withholdingAgent: "0", taxRegime: "GENERAL" } as BillingConfig;
    const xml = facturaXml({ ...factura(), emisor: emisorDe(config) });
    expect(xml).not.toContain("contribuyenteEspecial");
    expect(xml).not.toContain("agenteRetencion");
  });

  it("el rechazo dice dónde corregirlo", () => {
    expect(conPista("El SRI no la autorizó: 98 ERROR AL VALIDAR CONTRIBUYENTE ESPECIAL: El contribuyente no es Contribuyente Especial")).toContain("Ajustes → Factura autorizada");
    expect(conPista("El SRI la devolvió: 35 ARCHIVO NO CUMPLE ESTRUCTURA XML")).toBe("El SRI la devolvió: 35 ARCHIVO NO CUMPLE ESTRUCTURA XML");
  });
});

describe("la firma XAdES-BES", () => {
  const prueba = firmaDePrueba();

  it("abre la .p12 y escoge el certificado de la llave aunque venga la entidad primero", () => {
    const f = abrirFirma(prueba.p12, prueba.clave);
    expect(datosFirma(f)).toMatchObject({ titular: "JULIANA INTRIAGO", emisor: "AUTORIDAD DE CERTIFICACION DE PRUEBA" });
    expect(problemaDeFirma(f)).toBeNull();
  });

  it("con otra clave no abre, y una vencida no firma", () => {
    expect(() => abrirFirma(prueba.p12, "otra")).toThrow(/clave/);
    const vieja = firmaDePrueba("x", new Date(Date.now() - 86_400_000));
    expect(problemaDeFirma(abrirFirma(vieja.p12, "x"))).toMatch(/venció/);
  });

  it("xml-crypto la verifica: las tres referencias y el valor de la firma", () => {
    const firmado = firmarComprobante(facturaXml(factura()), abrirFirma(prueba.p12, prueba.clave));
    expect(firmado).toMatch(/<\/ds:Signature><\/factura>$/);
    const doc = new DOMParser().parseFromString(firmado, "text/xml");
    const nodo = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0];
    const sig = new SignedXml({ publicCert: prueba.certPem });
    sig.loadSignature(nodo as unknown as Node);
    expect(sig.checkSignature(firmado)).toBe(true);
    // La serie del certificado en decimal y completa.
    expect(firmado).toContain("<ds:X509SerialNumber>" + BigInt("0x7d3a9f00c1b2e4a5968778695a4b3c2d").toString() + "</ds:X509SerialNumber>");
  });

  it("si alguien cambia el comprobante despues de firmar, la firma ya no vale", () => {
    const firmado = firmarComprobante(facturaXml(factura()), abrirFirma(prueba.p12, prueba.clave)).replace("<importeTotal>9.20", "<importeTotal>1.00");
    const doc = new DOMParser().parseFromString(firmado, "text/xml");
    const sig = new SignedXml({ publicCert: prueba.certPem });
    sig.loadSignature(doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0] as unknown as Node);
    let vale: boolean;
    try {
      vale = sig.checkSignature(firmado);
    } catch {
      vale = false;
    }
    expect(vale).toBe(false);
  });
});

describe("Chopo Snacks factura directo con el SRI", () => {
  const db = new PrismaClient();
  const S = "sri-" + Date.now();
  const firma = firmaDePrueba();
  let servidor: http.Server;
  /** Lo que el SRI de mentira recibio, por clave de acceso. */
  const recibidos = new Map<string, string>();
  const envios: string[] = [];
  let modo: "autoriza" | "en-proceso" | "devuelve" | "caido" = "autoriza";

  const sobre = (cuerpo: string) =>
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' + cuerpo + "</soap:Body></soap:Envelope>";
  const recepcion = (estado: string, clave: string, mensaje = "") =>
    sobre(
      '<ns2:validarComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.recepcion"><RespuestaRecepcionComprobante><estado>' + estado + "</estado>" +
        "<comprobantes><comprobante><claveAcceso>" + clave + "</claveAcceso><mensajes>" + mensaje + "</mensajes></comprobante></comprobantes>" +
        "</RespuestaRecepcionComprobante></ns2:validarComprobanteResponse>"
    );
  const mensaje = (id: string, texto: string, info: string) =>
    "<mensaje><identificador>" + id + "</identificador><mensaje>" + texto + "</mensaje><informacionAdicional>" + info + "</informacionAdicional><tipo>ERROR</tipo></mensaje>";
  const autorizacion = (clave: string, autorizaciones: string, n: number) =>
    sobre(
      '<ns2:autorizacionComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><RespuestaAutorizacionComprobante><claveAccesoConsultada>' + clave +
        "</claveAccesoConsultada><numeroComprobantes>" + n + "</numeroComprobantes><autorizaciones>" + autorizaciones +
        "</autorizaciones></RespuestaAutorizacionComprobante></ns2:autorizacionComprobanteResponse>"
    );

  beforeAll(async () => {
    process.env.FACTURACION_SECRET = "secreto-de-prueba-facturacion-1234567890";
    servidor = http.createServer((req, res) => {
      let crudo = "";
      req.on("data", (c) => (crudo += c));
      req.on("end", () => {
        const ruta = req.url ?? "";
        const responder = (xml: string) => {
          res.writeHead(200, { "Content-Type": "text/xml; charset=utf-8" });
          res.end(xml);
        };
        if (modo === "caido") {
          res.writeHead(503);
          return res.end("Service Unavailable");
        }
        if (ruta === "/sri/pruebas/RecepcionComprobantesOffline") {
          const xml = Buffer.from(/<xml>([^<]+)<\/xml>/.exec(crudo)![1], "base64").toString("utf8");
          const clave = /<claveAcceso>(\d{49})<\/claveAcceso>/.exec(xml)![1];
          envios.push(clave);
          if (modo === "devuelve") {
            return responder(recepcion("DEVUELTA", clave, mensaje("35", "ARCHIVO NO CUMPLE ESTRUCTURA XML", "Se encontró en el elemento razonSocialComprador")));
          }
          if (recibidos.has(clave)) return responder(recepcion("DEVUELTA", clave, mensaje("43", "CLAVE ACCESO REGISTRADA", "")));
          recibidos.set(clave, xml);
          return responder(recepcion("RECIBIDA", clave));
        }
        if (ruta === "/sri/pruebas/AutorizacionComprobantesOffline") {
          const clave = /<claveAccesoComprobante>(\d+)<\/claveAccesoComprobante>/.exec(crudo)![1];
          const xml = recibidos.get(clave);
          if (!xml) return responder(autorizacion(clave, "", 0));
          if (modo === "en-proceso") return responder(autorizacion(clave, "<autorizacion><estado>EN PROCESO</estado><mensajes></mensajes></autorizacion>", 1));
          return responder(
            autorizacion(
              clave,
              "<autorizacion><estado>AUTORIZADO</estado><numeroAutorizacion>" + clave + "</numeroAutorizacion>" +
                "<fechaAutorizacion>2026-10-31T17:05:22-05:00</fechaAutorizacion><ambiente>PRUEBAS</ambiente>" +
                "<comprobante><![CDATA[" + xml + "]]></comprobante><mensajes></mensajes></autorizacion>",
              1
            )
          );
        }
        res.writeHead(404);
        res.end();
      });
    });
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
    process.env.SRI_BASE_URL = "http://127.0.0.1:" + (servidor.address() as AddressInfo).port + "/sri";
  });

  afterAll(async () => {
    servidor.close();
    delete process.env.SRI_BASE_URL;
    await db.user.deleteMany({ where: { slug: { contains: S } } });
    await db.$disconnect();
  });

  beforeEach(() => {
    modo = "autoriza";
  });

  async function negocio(nombre: string, businessName = "Chopo Snacks") {
    const u = await db.user.create({
      data: {
        email: nombre + "-" + S + "@test.local",
        passwordHash: "x",
        ownerName: "Juliana Intriago",
        businessName,
        businessType: "OTRO",
        slug: nombre + "-" + S,
        currency: "USD",
        timezone: "America/Guayaquil",
        staff: { create: { name: "Juliana Intriago", role: "DUENO" } },
      },
      include: { staff: true },
    });
    const { staff, ...user } = u;
    return { user, staff: staff[0] };
  }

  const datosSri = (extra: Record<string, unknown> = {}) => ({
    enabled: "on",
    country: "EC",
    provider: "sri",
    environment: "pruebas",
    taxKey: "2-15",
    taxId: "1790012345001",
    legalName: "CHOPO SNACKS S.A.",
    tradeName: "Chopo Snacks",
    fiscalAddress: "Av. Principal 123",
    establishment: "001",
    emissionPoint: "002",
    nextSequential: "7",
    taxRegime: "RIMPE_EMPRENDEDOR",
    p12: firma.p12.toString("base64"),
    p12Password: firma.clave,
    ...extra,
  });

  /** Dos papas a 1,15 con IVA: base 2,00 e IVA 0,30. */
  const venta = (userId: string) =>
    db.sale.create({ data: { userId, day: "2026-10-31", total: 230, items: { create: [{ userId, name: "PAPA GRANDE NAT", unitPrice: 115, qty: 2 }] } } });

  const cedula = { tipoDocumento: "05", numero: "1712345678", nombre: "María Pérez", correo: "maria@test.local" };

  it("solo Chopo puede facturar directo; la firma se revisa y no vuelve a la pantalla", async () => {
    const otro = await negocio("otro", "Tienda " + S);
    const r = await guardarConfiguracion(otro.user.id, datosSri());
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toMatch(/Dátil/);

    const chopo = await negocio("config");
    const mala = await guardarConfiguracion(chopo.user.id, datosSri({ p12Password: "otra" }));
    expect(mala.ok ? "" : mala.error).toMatch(/clave/);

    const buena = await guardarConfiguracion(chopo.user.id, datosSri());
    expect(buena.ok).toBe(true);
    const vista = await configuracionFacturacion(chopo.user.id);
    expect(vista).toMatchObject({ provider: "sri", sriDirecto: true, credencialesGuardadas: true, taxRegime: "RIMPE_EMPRENDEDOR" });
    expect(vista.firma?.titular).toBe("JULIANA INTRIAGO");
    const pedazo = firma.p12.toString("base64").slice(100, 160);
    expect(JSON.stringify(vista)).not.toContain(pedazo);
    const guardada = await db.billingConfig.findUniqueOrThrow({ where: { userId: chopo.user.id } });
    expect(guardada.credentials).not.toContain(pedazo);
    expect(descifrar(guardada.credentials)?.p12).toBe(firma.p12.toString("base64"));
  });

  it("una venta sale autorizada, con la firma que verifica y el XML autorizado guardado", async () => {
    const s = await negocio("autoriza");
    await guardarConfiguracion(s.user.id, datosSri());
    const v = await venta(s.user.id);
    const r = await emitirFactura(s, v.id, cedula);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos).toMatchObject({ estado: "AUTORIZADA", proveedor: "sri", numero: "001-002-000000007", conXml: true, subtotal: 2, impuesto: 0.3, total: 2.3 });
    expect(claveValida(r.datos.codigo ?? "")).toBe(true);

    const enviado = recibidos.get(r.datos.codigo!)!;
    expect(enviado).toContain("<identificacionComprador>1712345678</identificacionComprador>");
    expect(enviado).toContain("<importeTotal>2.30</importeTotal>");
    const doc = new DOMParser().parseFromString(enviado, "text/xml");
    const sig = new SignedXml({ publicCert: firma.certPem });
    sig.loadSignature(doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0] as unknown as Node);
    expect(sig.checkSignature(enviado)).toBe(true);

    const fila = await db.electronicInvoice.findUniqueOrThrow({ where: { saleId: v.id } });
    expect(fila.xml).toContain("<estado>AUTORIZADO</estado>");
    expect(fila.xml).toContain("<![CDATA[" + enviado + "]]>");

    // Pedirla otra vez no la manda de nuevo.
    const antes = envios.length;
    const otra = await emitirFactura(s, v.id, cedula);
    expect(otra.ok && otra.datos.numero).toBe("001-002-000000007");
    expect(envios.length).toBe(antes);
  });

  it("si la autorización tarda, queda enviando y el reintento la completa sin mandarla dos veces", async () => {
    const s = await negocio("tarda");
    await guardarConfiguracion(s.user.id, datosSri());
    const v = await venta(s.user.id);
    modo = "en-proceso";
    const r = await emitirFactura(s, v.id, cedula);
    expect(r.ok && r.datos.estado).toBe("ENVIANDO");
    const clave = r.ok ? r.datos.codigo! : "";

    modo = "autoriza";
    await db.electronicInvoice.update({ where: { saleId: v.id }, data: { updatedAt: new Date(Date.now() - 60_000) } });
    await reintentarFacturas();
    const fila = await db.electronicInvoice.findUniqueOrThrow({ where: { saleId: v.id } });
    expect(fila).toMatchObject({ status: "AUTORIZADA", authCode: clave, number: "001-002-000000007" });
    expect(envios.filter((c) => c === clave)).toHaveLength(1);
  });

  it("devuelta por el SRI queda rechazada con el motivo; al corregir sale con otro número", async () => {
    const s = await negocio("devuelta");
    await guardarConfiguracion(s.user.id, datosSri());
    const v = await venta(s.user.id);
    modo = "devuelve";
    const r = await emitirFactura(s, v.id, cedula);
    expect(r.ok && r.datos.estado).toBe("RECHAZADA");
    expect(r.ok && r.datos.mensaje).toMatch(/35 ARCHIVO NO CUMPLE ESTRUCTURA XML: Se encontró en el elemento razonSocialComprador/);

    modo = "autoriza";
    const otra = await emitirFactura(s, v.id, { ...cedula, nombre: "María Pérez Corregida" });
    expect(otra.ok && otra.datos).toMatchObject({ estado: "AUTORIZADA", numero: "001-002-000000008" });
  });

  it("si el SRI no contesta, queda con error y el reintento usa el mismo número y la misma clave", async () => {
    const s = await negocio("caido");
    await guardarConfiguracion(s.user.id, datosSri());
    const v = await venta(s.user.id);
    modo = "caido";
    const r = await emitirFactura(s, v.id, cedula);
    expect(r.ok && r.datos.estado).toBe("ERROR");
    const antes = await db.electronicInvoice.findUniqueOrThrow({ where: { saleId: v.id } });
    expect(antes.number).toBe("001-002-000000007");

    modo = "autoriza";
    await db.electronicInvoice.update({ where: { saleId: v.id }, data: { updatedAt: new Date(Date.now() - 10 * 60_000) } });
    await reintentarFacturas();
    const despues = await db.electronicInvoice.findUniqueOrThrow({ where: { saleId: v.id } });
    expect(despues).toMatchObject({ status: "AUTORIZADA", number: "001-002-000000007", authCode: antes.authCode });
  });

  it("con la firma vencida no se manda nada y queda rechazada diciendo por qué", async () => {
    const s = await negocio("vencida");
    const corta = firmaDePrueba("corta", new Date(Date.now() + 1_500));
    await guardarConfiguracion(s.user.id, datosSri({ p12: corta.p12.toString("base64"), p12Password: corta.clave }));
    await new Promise((r) => setTimeout(r, 2_000));
    const v = await venta(s.user.id);
    const antes = envios.length;
    const r = await emitirFactura(s, v.id, cedula);
    expect(r.ok && r.datos.estado).toBe("RECHAZADA");
    expect(r.ok && r.datos.mensaje).toMatch(/venció/);
    expect(envios.length).toBe(antes);
  });
});
