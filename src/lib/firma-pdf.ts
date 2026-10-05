import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Spot } from "./firma-spots";

/**
 * Pone la firma del cliente dentro del PDF y le agrega al final la constancia
 * de quien firmo, cuando y desde donde.
 *
 * Todo con pdf-lib en el servidor: el telefono solo manda la imagen de la
 * firma y los lugares. Asi el PDF firmado lo arma siempre el mismo codigo y
 * nadie puede mandar un "PDF firmado" hecho a mano.
 */

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Las letras de las fuentes estandar del PDF son las de Windows-1252: tildes y
 * eñe si, emojis no. Lo que no se pueda escribir sale como "?" en vez de
 * tumbar la firma.
 */
export function textoPdf(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E -ÿ]/g, "?");
}

/**
 * Convierte un punto visto en pantalla (desde la esquina de arriba de la
 * pagina ya girada) a las coordenadas del PDF, que cuentan desde abajo y no
 * saben del giro. Un escaneo puede venir con la pagina "girada" en el PDF y
 * derecha en pantalla: sin esto la firma caeria en otro lado.
 */
export function aPdf(page: PDFPage) {
  const caja = page.getCropBox();
  const giro = (((page.getRotation().angle ?? 0) % 360) + 360) % 360;
  const { x: x0, y: y0, width: W, height: H } = caja;
  const ancho = giro % 180 === 0 ? W : H;
  const alto = giro % 180 === 0 ? H : W;
  const punto = (nx: number, ny: number): { x: number; y: number } => {
    if (giro === 90) return { x: x0 + ny, y: y0 + nx };
    if (giro === 180) return { x: x0 + W - nx, y: y0 + ny };
    if (giro === 270) return { x: x0 + W - ny, y: y0 + H - nx };
    return { x: x0 + nx, y: y0 + H - ny };
  };
  return { ancho, alto, giro, punto };
}

export type Constancia = {
  negocio: string;
  solicitud: string;
  documento: string;
  firmante: string;
  identificacion: string | null;
  contacto: string | null;
  /** La fecha ya escrita en la zona del negocio. */
  fecha: string;
  ip: string | null;
  navegador: string | null;
  huellaOriginal: string;
  referencia: string;
};

/** Parte un texto largo en renglones que quepan en el ancho. */
function renglones(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const salida: string[] = [];
  let actual = "";
  for (const palabra of texto.split(" ")) {
    const prueba = actual ? actual + " " + palabra : palabra;
    if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) {
      actual = prueba;
      continue;
    }
    if (actual) salida.push(actual);
    // Una palabra sola mas ancha que el renglon (una huella, un navegador) se corta.
    let resto = palabra;
    while (fuente.widthOfTextAtSize(resto, tam) > ancho && resto.length > 1) {
      let n = resto.length - 1;
      while (n > 1 && fuente.widthOfTextAtSize(resto.slice(0, n), tam) > ancho) n--;
      salida.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    actual = resto;
  }
  if (actual) salida.push(actual);
  return salida;
}

export async function firmarPdf(
  original: Uint8Array,
  firmaPng: Uint8Array,
  spots: Spot[],
  constancia: Constancia
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original, { updateMetadata: false });
  const imagen = await doc.embedPng(firmaPng);
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const paginas = doc.getPages();
  const pie = textoPdf(constancia.firmante + " · " + constancia.fecha);

  for (const s of spots) {
    const page = paginas[s.page - 1];
    if (!page) continue;
    const { ancho, alto, giro, punto } = aPdf(page);
    const w = s.w * ancho;
    const h = s.h * alto;
    // Que la firma no se estire: cabe en la caja conservando su forma.
    const escala = Math.min(w / imagen.width, h / imagen.height);
    const iw = imagen.width * escala;
    const ih = imagen.height * escala;
    const dx = (w - iw) / 2;
    const dy = (h - ih) / 2;
    // La imagen se dibuja desde su esquina de abajo a la izquierda, como se ve en pantalla.
    const esquina = punto(s.x * ancho + dx, (s.y + s.h) * alto - dy);
    page.drawImage(imagen, { x: esquina.x, y: esquina.y, width: iw, height: ih, rotate: degrees(giro) });

    // Debajo de la firma, en letra chica, quien y cuando. Si no cabe en la
    // pagina se pone adentro de la caja, abajo.
    const tam = Math.max(4, Math.min(7, h * 0.16));
    const debajo = (s.y + s.h) * alto + tam + 1 <= alto;
    const base = punto(s.x * ancho, debajo ? (s.y + s.h) * alto + tam : (s.y + s.h) * alto - 1);
    const linea = renglones(pie, fuente, tam, Math.max(w, 60))[0] ?? "";
    page.drawText(linea, { x: base.x, y: base.y, size: tam, font: fuente, color: rgb(0.25, 0.25, 0.3), rotate: degrees(giro) });
  }

  // La constancia: una hoja al final, tamano carta.
  const hoja = doc.addPage([612, 792]);
  const margen = 54;
  const util = 612 - margen * 2;
  let y = 792 - margen;
  const escribir = (texto: string, opts: { tam?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}) => {
    const tam = opts.tam ?? 10;
    for (const r of renglones(textoPdf(texto), opts.bold ? negrita : fuente, tam, util)) {
      hoja.drawText(r, {
        x: margen,
        y: y - tam,
        size: tam,
        font: opts.bold ? negrita : fuente,
        color: rgb(...(opts.color ?? [0.1, 0.1, 0.12])),
      });
      y -= tam + 4;
    }
    y -= opts.gap ?? 4;
  };

  escribir("Constancia de firma electrónica", { tam: 18, bold: true, gap: 6 });
  escribir(constancia.negocio, { tam: 11, color: [0.35, 0.35, 0.4], gap: 14 });

  const fila = (etiqueta: string, valor: string | null) => {
    if (!valor) return;
    escribir(etiqueta, { tam: 8, bold: true, color: [0.4, 0.4, 0.45], gap: 0 });
    escribir(valor, { tam: 10, gap: 8 });
  };
  fila("DOCUMENTO", constancia.documento);
  fila("SOLICITUD", constancia.solicitud);
  fila("FIRMADO POR", constancia.firmante);
  fila("IDENTIFICACIÓN", constancia.identificacion);
  fila("CONTACTO", constancia.contacto);
  fila("FECHA Y HORA", constancia.fecha);
  fila("DIRECCIÓN IP", constancia.ip);
  fila("DISPOSITIVO", constancia.navegador);
  fila("HUELLA SHA-256 DEL DOCUMENTO ORIGINAL", constancia.huellaOriginal);
  fila("REFERENCIA", constancia.referencia);

  y -= 6;
  escribir("FIRMA", { tam: 8, bold: true, color: [0.4, 0.4, 0.45], gap: 2 });
  const caja = { w: 220, h: 90 };
  const escala = Math.min(caja.w / imagen.width, caja.h / imagen.height);
  hoja.drawRectangle({
    x: margen,
    y: y - caja.h - 8,
    width: caja.w + 16,
    height: caja.h + 8,
    borderColor: rgb(0.8, 0.8, 0.84),
    borderWidth: 0.8,
  });
  hoja.drawImage(imagen, { x: margen + 8, y: y - caja.h - 4, width: imagen.width * escala, height: imagen.height * escala });
  y -= caja.h + 24;

  escribir(
    "La persona firmante aceptó firmar electrónicamente este documento desde el enlace que le envió " +
      constancia.negocio +
      ". La huella SHA-256 identifica el documento original: si cambia una sola letra, la huella deja de coincidir.",
    { tam: 8, color: [0.4, 0.4, 0.45] }
  );

  doc.setModificationDate(new Date());
  return doc.save();
}

/**
 * Revisa que un PDF se pueda abrir y firmar, y cuenta sus paginas. Uno con
 * clave no se puede: pdf-lib no lo puede escribir sin romperlo.
 */
export async function revisarPdf(bytes: Uint8Array): Promise<{ ok: true; paginas: number } | { ok: false; error: string }> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return { ok: true, paginas: doc.getPageCount() };
  } catch (e) {
    const nombre = (e as { name?: string; message?: string })?.message ?? "";
    if (/encrypt/i.test(nombre)) return { ok: false, error: "Ese PDF tiene clave. Quítasela y vuelve a subirlo." };
    return { ok: false, error: "Ese PDF está dañado o no se puede abrir." };
  }
}

/** Una foto (JPG o PNG) como un PDF de una pagina, del tamano de una hoja carta. */
export async function imagenAPdf(bytes: Uint8Array, tipo: "jpg" | "png"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const img = tipo === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const ancho = 612;
  const alto = Math.max(200, Math.min(2000, (img.height / img.width) * ancho));
  const page = doc.addPage([ancho, alto]);
  const escala = Math.min(ancho / img.width, alto / img.height);
  page.drawImage(img, { x: 0, y: alto - img.height * escala, width: img.width * escala, height: img.height * escala });
  return doc.save();
}
