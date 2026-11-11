import { barrasCode128 } from "../../code128";
import { APP_NAME } from "../../brand";
import { CODIGO_TARIFA_SRI } from "../paises";
import { FORMA_PAGO } from "./xml";

/**
 * El RIDE de la factura: la representacion impresa del comprobante
 * electronico que exige el SRI, la que se le manda al cliente con el XML.
 *
 * Se arma desde el XML AUTORIZADO, no desde la venta: lo que sale en el papel
 * es exactamente lo que el SRI aprobo (numero, fecha, comprador, renglones y
 * totales), aunque despues alguien cambie la venta.
 *
 * El diseño es el que pidio Chopo Snacks (el de su sistema anterior): logo y
 * datos del emisor a la izquierda, numero y autorizacion con el codigo de
 * barras a la derecha, el comprador, el detalle, y los totales en azul.
 *
 * Archivo sin base de datos ni cosas del navegador: corre en el servidor, que
 * es quien manda el correo.
 */

export type DetalleRide = {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  total: number;
};

export type ImpuestoRide = { codigoPorcentaje: string; base: number; valor: number };

export type FacturaRide = {
  numeroAutorizacion: string;
  /** Como la manda el SRI: "2026-11-06T10:30:33-05:00". */
  fechaAutorizacion: string;
  produccion: boolean;
  razonSocial: string;
  nombreComercial: string;
  ruc: string;
  claveAcceso: string;
  /** "001-011-000000356". */
  numero: string;
  dirMatriz: string;
  dirEstablecimiento: string;
  contribuyenteRimpe: string;
  agenteRetencion: string;
  contribuyenteEspecial: string;
  obligadoContabilidad: string;
  /** "YYYY-MM-DD". */
  fechaEmision: string;
  comprador: { identificacion: string; razonSocial: string; direccion: string };
  totalSinImpuestos: number;
  totalDescuento: number;
  impuestos: ImpuestoRide[];
  propina: number;
  importeTotal: number;
  pagos: { formaPago: string; total: number }[];
  detalles: DetalleRide[];
  adicionales: { nombre: string; valor: string }[];
};

// ------------------------------------------------------------ leer el XML

const desescapar = (v: string) =>
  v
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** El texto del primer elemento con ese nombre (exacto: <pago> no es <pagos>). */
function uno(xml: string, nombre: string): string {
  const m = new RegExp("<" + nombre + "(?:\\s[^>]*)?>([^<]*)</" + nombre + ">").exec(xml);
  return m ? desescapar(m[1]).trim() : "";
}

/** El contenido de cada elemento con ese nombre, con sus atributos. */
function todos(xml: string, nombre: string): { atributos: string; contenido: string }[] {
  const patron = new RegExp("<" + nombre + "(\\s[^>]*)?>([\\s\\S]*?)</" + nombre + ">", "g");
  return [...xml.matchAll(patron)].map((m) => ({ atributos: m[1] ?? "", contenido: m[2] }));
}

const numero = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** "06/11/2026" a "2026-11-06". */
const diaIso = (sri: string) => sri.split("/").reverse().join("-");

/**
 * Lee el XML autorizado que se guarda (el <autorizacion> con el comprobante
 * dentro). Tambien acepta el comprobante solo.
 */
export function leerFacturaAutorizada(xmlAutorizado: string): FacturaRide {
  const crudo = /<comprobante>([\s\S]*)<\/comprobante>/.exec(xmlAutorizado)?.[1]?.trim();
  const comprobante = (
    crudo === undefined ? xmlAutorizado : crudo.startsWith("<![CDATA[") ? crudo.slice(9, -3) : desescapar(crudo)
  ).replace(/<ds:Signature[\s\S]*<\/ds:Signature>/, "");
  if (!/<factura[\s>]/.test(comprobante)) throw new Error("Ese XML no es una factura.");

  const fuera = crudo === undefined ? "" : xmlAutorizado.replace(/<comprobante>[\s\S]*<\/comprobante>/, "");
  const tributaria = todos(comprobante, "infoTributaria")[0]?.contenido ?? "";
  const info = todos(comprobante, "infoFactura")[0]?.contenido ?? "";
  const clave = uno(tributaria, "claveAcceso");

  return {
    numeroAutorizacion: uno(fuera, "numeroAutorizacion") || clave,
    fechaAutorizacion: uno(fuera, "fechaAutorizacion"),
    produccion: uno(tributaria, "ambiente") === "2",
    razonSocial: uno(tributaria, "razonSocial"),
    nombreComercial: uno(tributaria, "nombreComercial"),
    ruc: uno(tributaria, "ruc"),
    claveAcceso: clave,
    numero: [uno(tributaria, "estab"), uno(tributaria, "ptoEmi"), uno(tributaria, "secuencial")].join("-"),
    dirMatriz: uno(tributaria, "dirMatriz"),
    dirEstablecimiento: uno(info, "dirEstablecimiento"),
    contribuyenteRimpe: uno(tributaria, "contribuyenteRimpe"),
    agenteRetencion: uno(tributaria, "agenteRetencion"),
    contribuyenteEspecial: uno(info, "contribuyenteEspecial"),
    obligadoContabilidad: uno(info, "obligadoContabilidad"),
    fechaEmision: diaIso(uno(info, "fechaEmision")),
    comprador: {
      identificacion: uno(info, "identificacionComprador"),
      razonSocial: uno(info, "razonSocialComprador"),
      direccion: uno(info, "direccionComprador"),
    },
    totalSinImpuestos: numero(uno(info, "totalSinImpuestos")),
    totalDescuento: numero(uno(info, "totalDescuento")),
    impuestos: todos(info, "totalImpuesto").map(({ contenido }) => ({
      codigoPorcentaje: uno(contenido, "codigoPorcentaje"),
      base: numero(uno(contenido, "baseImponible")),
      valor: numero(uno(contenido, "valor")),
    })),
    propina: numero(uno(info, "propina")),
    importeTotal: numero(uno(info, "importeTotal")),
    pagos: todos(info, "pago").map(({ contenido }) => ({
      formaPago: uno(contenido, "formaPago"),
      total: numero(uno(contenido, "total")),
    })),
    detalles: todos(comprobante, "detalle").map(({ contenido }) => ({
      codigo: uno(contenido, "codigoPrincipal"),
      descripcion: uno(contenido, "descripcion"),
      cantidad: numero(uno(contenido, "cantidad")),
      precioUnitario: numero(uno(contenido, "precioUnitario")),
      descuento: numero(uno(contenido, "descuento")),
      total: numero(uno(contenido, "precioTotalSinImpuesto")),
    })),
    adicionales: todos(comprobante, "campoAdicional").map(({ atributos, contenido }) => ({
      nombre: desescapar(/nombre="([^"]*)"/.exec(atributos)?.[1] ?? ""),
      valor: desescapar(contenido).trim(),
    })),
  };
}

// ------------------------------------------------------------ formatos

/** "$ 1.234,50", como en el RIDE que tenian. */
export function dolares(n: number): string {
  const [entero, dec] = Math.abs(n).toFixed(2).split(".");
  return (n < 0 ? "-" : "") + "$ " + entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
}

/** El precio unitario: dos decimales, o hasta seis si los tiene (el SRI los acepta). */
function unitario(n: number): string {
  const seis = n.toFixed(6).replace(/0+$/, "");
  const [entero, dec = ""] = seis.split(".");
  return "$ " + entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec.padEnd(2, "0");
}

const cantidad = (n: number) => n.toFixed(2).replace(".", ",");

/** Tarifa del IVA por su codigo (tabla 17 del SRI). */
const TARIFA_POR_CODIGO: Record<string, string> = {
  ...Object.fromEntries(Object.entries(CODIGO_TARIFA_SRI).map(([tarifa, codigo]) => [codigo, tarifa + "%"])),
  "6": "NO OBJETO DE IVA",
  "7": "EXENTO DE IVA",
  "8": "IVA DIFERENCIADO",
};
const tarifa = (codigo: string) => TARIFA_POR_CODIGO[codigo] ?? codigo;

/**
 * La fecha de emision con la hora en que se autorizo, si es del mismo dia:
 * "2026-11-06 10:30:33". El SRI la manda con la hora de Ecuador.
 */
export function fechaConHora(f: FacturaRide): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(f.fechaAutorizacion);
  return m && m[1] === f.fechaEmision ? f.fechaEmision + " " + m[2] : f.fechaEmision;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// ------------------------------------------------------------ el PDF

/** Lo que el XML no trae y el RIDE si muestra. */
export type ExtrasRide = {
  /** El logo como data URL (el que se guarda en la cuenta). */
  logo?: string | null;
  telefono?: string | null;
  correo?: string | null;
  /** "Calificación Artesanal Nº", si el negocio es artesano calificado. */
  calificacionArtesanal?: string | null;
};

type Pdf = InstanceType<typeof import("jspdf").jsPDF>;

const AZUL: [number, number, number] = [21, 87, 214];
const GRIS_CAJA: [number, number, number] = [232, 234, 238];
const M = 12;
const R = 198;

/** El formato de la imagen para jsPDF, por el comienzo del data URL. */
function formatoImagen(dataUrl: string): string | null {
  const m = /^data:image\/(png|jpe?g|webp);base64,/i.exec(dataUrl);
  if (!m) return null;
  const t = m[1].toLowerCase();
  return t === "png" ? "PNG" : t === "webp" ? "WEBP" : "JPEG";
}

function codigoDeBarras(doc: Pdf, texto: string, x: number, y: number, ancho: number, alto: number) {
  const barras = barrasCode128(texto);
  const modulos = barras.reduce((s, b) => s + b, 0);
  const paso = ancho / modulos;
  doc.setFillColor(0, 0, 0);
  let cx = x;
  barras.forEach((w, i) => {
    if (i % 2 === 0) doc.rect(cx, y, w * paso, alto, "F");
    cx += w * paso;
  });
}

/** Etiqueta en negrita y valor normal en el mismo renglon; devuelve cuanto bajo. */
function etiquetaValor(doc: Pdf, etiqueta: string, valor: string, x: number, y: number, ancho: number, tam: number): number {
  doc.setFontSize(tam);
  doc.setFont("helvetica", "bold");
  doc.text(etiqueta, x, y);
  const w = doc.getTextWidth(etiqueta + " ");
  doc.setFont("helvetica", "normal");
  const lineas = doc.splitTextToSize(valor || "", Math.max(10, ancho - w)) as string[];
  doc.text(lineas.length ? lineas : [""], x + w, y);
  return Math.max(1, lineas.length) * tam * 0.42;
}

/** El RIDE de la factura en PDF (A4). */
export async function rideFacturaPdf(f: FacturaRide, extras: ExtrasRide = {}): Promise<Uint8Array<ArrayBuffer>> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setTextColor(0);

  // ---- Izquierda: logo, caja del emisor y sus datos.
  let yL = 10;
  const anchoIzq = 90;
  const formato = extras.logo ? formatoImagen(extras.logo) : null;
  let conLogo = false;
  if (extras.logo && formato) {
    try {
      const p = doc.getImageProperties(extras.logo);
      const escala = Math.min(anchoIzq / p.width, 42 / p.height);
      const w = p.width * escala;
      const h = p.height * escala;
      doc.addImage(extras.logo, formato, M, yL, w, h);
      yL += h + 4;
      conLogo = true;
    } catch {
      // Un logo que no se puede incrustar no impide la factura.
    }
  }
  if (!conLogo) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    const nombre = doc.splitTextToSize(f.nombreComercial || f.razonSocial, anchoIzq) as string[];
    doc.text(nombre, M, yL + 8);
    yL += 8 + nombre.length * 7 + 2;
  }

  const caja = [f.razonSocial, f.nombreComercial, f.ruc].filter(Boolean);
  const altoCaja = 4 + caja.length * 5.2;
  doc.setFillColor(...GRIS_CAJA);
  doc.roundedRect(M, yL, anchoIzq * 0.82, altoCaja, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  caja.forEach((t, i) => {
    if (i === 0) doc.setTextColor(...AZUL);
    else doc.setTextColor(30);
    doc.text(t, M + 3, yL + 5.5 + i * 5.2);
  });
  doc.setTextColor(0);
  yL += altoCaja + 6;

  const bloque = (etiqueta: string, valor: string | null | undefined) => {
    if (!valor) return;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(etiqueta, M, yL);
    yL += 3;
    doc.setFont("helvetica", "normal");
    const lineas = doc.splitTextToSize(valor.toUpperCase(), anchoIzq) as string[];
    doc.text(lineas, M, yL);
    yL += lineas.length * 2.9 + 0.6;
  };
  const renglon = (texto: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(doc.splitTextToSize(texto, anchoIzq) as string[], M, yL);
    yL += 3;
  };
  bloque("Dirección Matriz:", f.dirMatriz);
  bloque("Dirección Sucursal:", f.dirEstablecimiento || f.dirMatriz);
  if (extras.telefono || extras.correo || extras.calificacionArtesanal) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text("Contactos:", M, yL);
    yL += 3;
    if (extras.telefono) renglon("Teléfono: " + extras.telefono);
    if (extras.correo) renglon("Correo: " + extras.correo);
    if (extras.calificacionArtesanal) renglon("Calificación Artesanal Nº: " + extras.calificacionArtesanal);
  }
  if (f.contribuyenteEspecial) renglon("Contribuyente Especial Nro: " + f.contribuyenteEspecial);
  if (f.obligadoContabilidad) renglon("Obligado a llevar contabilidad: " + f.obligadoContabilidad);
  if (f.agenteRetencion) renglon("Agente de Retención Resolución No. " + f.agenteRetencion);
  if (f.contribuyenteRimpe) renglon(f.contribuyenteRimpe);

  // ---- Derecha: tipo, numero, autorizacion y codigo de barras.
  const xD = 110;
  let yR = 19;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.text("FACTURA", R, yR, { align: "right" });
  const wFactura = doc.getTextWidth("FACTURA");
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.6);
  doc.line(R - wFactura, yR + 1.6, R, yR + 1.6);
  doc.setLineWidth(0.2);

  yR += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...AZUL);
  doc.text(f.numero, R, yR, { align: "right" });
  const wNumero = doc.getTextWidth(f.numero);
  doc.setTextColor(0);
  doc.setFontSize(8.5);
  doc.text("Nº", R - wNumero - 2, yR, { align: "right" });

  yR += 6;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(fechaConHora(f), R, yR, { align: "right" });
  const wFecha = doc.getTextWidth(fechaConHora(f));
  doc.setFont("helvetica", "bold");
  doc.text("Fecha de emisión:", R - wFecha - 6, yR, { align: "right" });

  yR += 8;
  doc.setFontSize(6.5);
  doc.text("NUMERO DE AUTORIZACIÓN:", xD, yR);
  yR += 3.2;
  doc.setFont("helvetica", "normal");
  doc.text(f.numeroAutorizacion, xD, yR);
  const fila = (etiqueta: string, valor: string) => {
    yR += 4.4;
    doc.setFont("helvetica", "bold");
    doc.text(etiqueta, xD, yR);
    doc.setFont("helvetica", "normal");
    doc.text(valor, xD + 32, yR);
  };
  if (f.fechaAutorizacion) fila("FECHA AUTORIZACIÓN:", f.fechaAutorizacion.replace("T", " ").replace(/([+-]\d{2}:\d{2}|Z)$/, ""));
  fila("AMBIENTE:", f.produccion ? "PRODUCCIÓN" : "PRUEBAS");
  fila("EMISIÓN:", "NORMAL");
  yR += 2;
  try {
    codigoDeBarras(doc, f.claveAcceso, xD, yR, R - xD, 9);
    yR += 9;
  } catch {
    // Sin clave legible no hay codigo; los digitos van arriba igual.
  }
  if (!f.produccion) {
    yR += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("AMBIENTE DE PRUEBAS - SIN VALIDEZ TRIBUTARIA", xD, yR);
  }

  // ---- El comprador.
  let y = Math.max(yL, yR) + 5;
  doc.setDrawColor(150);
  doc.line(M, y, R, y);
  y += 5.5;
  const correoComprador = f.adicionales.find((a) => /^(e-?mail|correo)$/i.test(a.nombre))?.valor ?? "";
  y += etiquetaValor(doc, "Cliente:", f.comprador.razonSocial, M, y, R - M, 9) + 0.6;
  y += etiquetaValor(doc, "Identificación:", f.comprador.identificacion, M, y, R - M, 9) + 0.4;
  y += etiquetaValor(doc, "Dirección:", f.comprador.direccion || "/", M, y, R - M, 6.5);
  if (correoComprador) y += etiquetaValor(doc, "Correo:", correoComprador, M, y, R - M, 6.5);

  // ---- El detalle.
  y += 2;
  const col = { codigo: M + 1, desc: 40, cant: 143, pu: 161, desc2: 178, total: R - 1 };
  const encabezado = () => {
    doc.setDrawColor(90);
    doc.line(M, y, R, y);
    y += 3.6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...AZUL);
    doc.text("CÓDIGO", col.codigo, y);
    doc.text("DESCRIPCIÓN", col.desc, y);
    doc.text("CANT.", col.cant, y, { align: "right" });
    doc.text("P. U.", col.pu, y, { align: "right" });
    doc.text("DESC.", col.desc2, y, { align: "right" });
    doc.text("TOTAL", col.total, y, { align: "right" });
    doc.setTextColor(0);
    y += 1.6;
    doc.line(M, y, R, y);
  };
  encabezado();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  for (const d of f.detalles) {
    const desc = doc.splitTextToSize(d.descripcion, col.cant - 14 - col.desc) as string[];
    const alto = desc.length * 2.8 + 2.4;
    if (y + alto > 268) {
      doc.addPage();
      y = 15;
      encabezado();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
    }
    const base = y + 3.4;
    doc.text(doc.splitTextToSize(d.codigo, col.desc - col.codigo - 2) as string[], col.codigo, base);
    doc.text(desc, col.desc, base);
    doc.text(cantidad(d.cantidad), col.cant, base, { align: "right" });
    doc.text(unitario(d.precioUnitario), col.pu, base, { align: "right" });
    doc.text(dolares(d.descuento), col.desc2, base, { align: "right" });
    doc.text(dolares(d.total), col.total, base, { align: "right" });
    y += alto;
    doc.setDrawColor(200);
    doc.line(M, y, R, y);
  }

  // ---- Totales a la derecha, informacion adicional y pagos a la izquierda.
  y += 3;
  if (y > 225) {
    doc.addPage();
    y = 15;
  }
  const yTotales = y;
  const xT = 128;
  const filas: [string, number, boolean][] = [["DESCUENTO", f.totalDescuento, true], ["SUBTOTAL GENERAL", f.totalSinImpuestos, false]];
  for (const i of f.impuestos) filas.push(["SUBTOTAL " + tarifa(i.codigoPorcentaje), i.base, false]);
  for (const i of f.impuestos) {
    if (/%$/.test(tarifa(i.codigoPorcentaje))) filas.push(["IVA " + tarifa(i.codigoPorcentaje), i.valor, false]);
  }
  if (f.propina > 0) filas.push(["PROPINA", f.propina, false]);
  let yT = yTotales;
  doc.setFontSize(7.5);
  for (const [etiqueta, valor, azul] of filas) {
    yT += 4.2;
    doc.setFont("helvetica", "normal");
    if (azul) doc.setTextColor(...AZUL);
    doc.text(etiqueta, xT + 1, yT);
    doc.text(dolares(valor), R - 1, yT, { align: "right" });
    doc.setTextColor(0);
    doc.setDrawColor(215);
    doc.line(xT, yT + 1.2, R, yT + 1.2);
  }
  yT += 3.5;
  doc.setFillColor(...AZUL);
  doc.roundedRect(xT, yT, R - xT, 8, 2, 2, "F");
  doc.setDrawColor(255);
  doc.setLineWidth(0.4);
  doc.line(167, yT, 167, yT + 8);
  doc.setLineWidth(0.2);
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Valor Total", xT + 4, yT + 5.5);
  doc.text(dolares(f.importeTotal), R - 3, yT + 5.5, { align: "right" });
  doc.setTextColor(0);
  yT += 8;

  let yI = yTotales + 4.2;
  const anchoInfo = xT - M - 8;
  const titulo = (t: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(t, M, yI);
    yI += 3.6;
  };
  const linea = (t: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    const l = doc.splitTextToSize(t, anchoInfo) as string[];
    doc.text(l, M, yI);
    yI += l.length * 2.9 + 0.4;
  };
  titulo("Información adicional:");
  for (const a of f.adicionales) linea(a.nombre + ": " + a.valor);
  yI += 3;
  titulo("Observación:");
  yI += 3;
  titulo("Formas de Pago:");
  for (const p of f.pagos) linea(sinTildes(FORMA_PAGO[p.formaPago] ?? p.formaPago).toUpperCase() + " " + dolares(p.total));

  // ---- Pie.
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(150);
    doc.line(M, 284, R, 284);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(60);
    doc.text("Comprobante generado por " + APP_NAME, M, 287.5);
    if (total > 1) doc.text("Página " + p + " de " + total, R, 287.5, { align: "right" });
    doc.setTextColor(0);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

export function nombreRide(f: Pick<FacturaRide, "numero">): string {
  return "factura-" + f.numero + ".pdf";
}
