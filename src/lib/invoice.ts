import { money, prettyDay } from "./format";
import { qrModulos } from "./qr";
import type { Linea } from "./tirilla";
import { MARCA_VERSION_GRATIS } from "./plan";

/**
 * Armado de la factura en PDF, en el navegador.
 *
 * Se hace del lado del cliente a proposito: asi el negocio puede compartir el
 * archivo directo a WhatsApp desde el celular, sin que el PDF tenga que pasar
 * por el servidor ni quedar guardado en ninguna parte.
 */
export type InvoiceItem = {
  name: string;
  qty: number;
  unitPrice: number;
};

export type InvoiceData = {
  saleId: string;
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  /** Direccion del logo dentro de la misma aplicacion, si el negocio tiene. */
  logoUrl: string | null;
  currency: string;
  day: string;
  clientName: string | null;
  paymentMethod: string;
  staffName: string | null;
  items: InvoiceItem[];
  total: number;
  notes: string | null;
  /**
   * La venta se hizo sin senal y todavia no tiene numero: el que le ponga el
   * servidor al subirla seria otro, asi que el recibo no inventa uno.
   */
  provisional?: boolean;
  /** La autorizacion de la DIAN o el SRI, cuando la venta tiene factura autorizada. */
  autorizacion?: AutorizacionFactura;
  /** La cuenta esta en la version gratis: la factura normal sale con la marca. */
  marcaGratis?: boolean;
};

/**
 * Lo que convierte la factura normal en factura autorizada.
 *
 * Los valores van en la misma unidad que el resto de la factura (la que
 * entiende money()), para que el subtotal y el impuesto se lean igual.
 */
export type AutorizacionFactura = {
  pais: "CO" | "EC";
  /** El numero oficial: SETP990000001 o 001-001-000000123. */
  numero: string;
  /** "CUFE" o "Clave de acceso". */
  etiquetaCodigo: string;
  codigo: string;
  /** Lo que lleva el QR: el enlace de consulta de la DIAN o la clave de acceso. */
  qr: string | null;
  /** Cuando se autorizo, en ISO. */
  fecha: string | null;
  /** Ambiente de pruebas: la factura no tiene validez fiscal. */
  pruebas: boolean;
  compradorDocumento: string | null;
  subtotal: number;
  impuesto: number;
  etiquetaImpuesto: string;
};

const LEYENDA: Record<AutorizacionFactura["pais"], string> = {
  CO: "Factura electronica de venta validada por la DIAN",
  EC: "Comprobante electronico autorizado por el SRI",
};

function fechaCorta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

const PAYMENT_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

/** Numero corto y legible de la factura, sacado del id de la venta. */
export function invoiceNumber(saleId: string): string {
  return saleId.slice(-8).toUpperCase();
}

/** El numero que se imprime: el oficial si la factura esta autorizada. */
function numeroDe(data: InvoiceData): string {
  return data.autorizacion?.numero ?? invoiceNumber(data.saleId);
}

export function invoiceFileName(data: InvoiceData): string {
  const slug = data.businessName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 30);
  const numero = numeroDe(data).replace(/[^a-zA-Z0-9-]+/g, "");
  return (data.autorizacion ? "factura-electronica-" : "factura-") + (slug || "venta") + "-" + numero + ".pdf";
}

/** El texto que acompaña a la factura en WhatsApp o en el correo. */
export function invoiceMessage(data: InvoiceData): string {
  const lines = [
    (data.autorizacion ? "Factura electrónica " : "Factura ") + numeroDe(data) + " - " + data.businessName,
    prettyDay(data.day),
    "",
    ...data.items.map(
      (i) => i.qty + " x " + i.name + "   " + money(i.unitPrice * i.qty, data.currency)
    ),
    "",
    "Total: " + money(data.total, data.currency),
    "Pago: " + (PAYMENT_LABEL[data.paymentMethod] ?? data.paymentMethod),
  ];
  if (data.clientName) lines.splice(2, 0, "Cliente: " + data.clientName);
  if (data.autorizacion) lines.push(data.autorizacion.etiquetaCodigo + ": " + data.autorizacion.codigo);
  lines.push("", "Gracias por tu compra.");
  return lines.join("\n");
}

/** Trae el logo y lo pasa a data URL para poder incrustarlo en el PDF. */
async function loadLogo(url: string): Promise<{ data: string; format: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    // El SVG no lo soporta jsPDF; en ese caso se imprime solo el nombre.
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(blob.type)) return null;

    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("No se pudo leer el logo."));
      reader.readAsDataURL(blob);
    });

    return { data, format: blob.type === "image/png" ? "PNG" : "JPEG" };
  } catch {
    return null;
  }
}

/** Genera el PDF de la factura y lo devuelve como archivo listo para compartir. */
type Pdf = InstanceType<typeof import("jspdf").jsPDF>;

/** La marca de la version gratis: abajo a la derecha y, suave, cruzada en la hoja. */
export function marcarVersionGratis(doc: Pdf, rightX: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(MARCA_VERSION_GRATIS, rightX, 285, { align: "right" });
  try {
    // jsPDF crea la transparencia con new, aunque sus tipos la declaren como metodo.
    const Transparencia = doc.GState as unknown as new (p: { opacity: number }) => object;
    doc.setGState(new Transparencia({ opacity: 0.08 }));
    doc.setFontSize(54);
    doc.setTextColor(0);
    doc.text("VERSIÓN GRATIS", 105, 175, { align: "center", angle: 30 });
    doc.setGState(new Transparencia({ opacity: 1 }));
  } catch {
    // Sin transparencia queda solo la marca de abajo.
  }
  doc.setFont("helvetica", "normal");
}

export async function buildInvoicePdf(data: InvoiceData): Promise<File> {
  // Carga diferida: jsPDF pesa, y solo hace falta cuando alguien pide la factura.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const marginX = 18;
  const rightX = 210 - marginX;
  let y = 20;

  const logo = data.logoUrl ? await loadLogo(data.logoUrl) : null;
  if (logo) {
    try {
      doc.addImage(logo.data, logo.format, marginX, y - 6, 20, 20);
    } catch {
      // Si el logo no se puede incrustar, la factura sale igual sin el.
    }
  }

  const headerX = logo ? marginX + 26 : marginX;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(data.businessName, headerX, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  let subY = y + 5;
  if (data.businessAddress) {
    doc.text(data.businessAddress, headerX, subY);
    subY += 4;
  }
  if (data.businessPhone) {
    doc.text("Tel: " + data.businessPhone, headerX, subY);
    subY += 4;
  }

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(data.autorizacion ? "FACTURA ELECTRONICA DE VENTA" : "FACTURA DE VENTA", rightX, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("No. " + numeroDe(data), rightX, y + 5, { align: "right" });
  doc.text(prettyDay(data.day), rightX, y + 9, { align: "right" });

  y = Math.max(subY, y + 14) + 6;
  doc.setDrawColor(215);
  doc.line(marginX, y, rightX, y);
  y += 8;

  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Cliente", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.clientName || "Mostrador", marginX + 22, y);
  if (data.autorizacion?.compradorDocumento) {
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(data.autorizacion.compradorDocumento, marginX + 22, y + 4.5);
    doc.setTextColor(0);
    doc.setFontSize(10);
  }

  if (data.staffName) {
    doc.setFont("helvetica", "bold");
    doc.text("Atendio", 120, y);
    doc.setFont("helvetica", "normal");
    doc.text(data.staffName, 140, y);
  }
  y += 10;

  // Encabezado de la tabla.
  doc.setFillColor(243, 244, 246);
  doc.rect(marginX, y - 5, rightX - marginX, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Descripcion", marginX + 2, y);
  doc.text("Cant.", 128, y, { align: "right" });
  doc.text("Precio", 158, y, { align: "right" });
  doc.text("Total", rightX - 2, y, { align: "right" });
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const item of data.items) {
    // Una pagina nueva cuando la venta trae muchas lineas.
    if (y > 258) {
      doc.addPage();
      y = 25;
    }
    const name = doc.splitTextToSize(item.name, 100) as string[];
    doc.text(name, marginX + 2, y);
    doc.text(String(item.qty), 128, y, { align: "right" });
    doc.text(money(item.unitPrice, data.currency), 158, y, { align: "right" });
    doc.text(money(item.unitPrice * item.qty, data.currency), rightX - 2, y, { align: "right" });
    y += Math.max(6, name.length * 5);
    doc.setDrawColor(235);
    doc.line(marginX, y - 3, rightX, y - 3);
  }

  y += 4;
  if (data.autorizacion) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Subtotal", 140, y);
    doc.text(money(data.autorizacion.subtotal, data.currency), rightX - 2, y, { align: "right" });
    y += 5;
    doc.text(data.autorizacion.etiquetaImpuesto, 140, y);
    doc.text(money(data.autorizacion.impuesto, data.currency), rightX - 2, y, { align: "right" });
    y += 7;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL", 140, y);
  doc.text(money(data.total, data.currency), rightX - 2, y, { align: "right" });

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(
    "Forma de pago: " + (PAYMENT_LABEL[data.paymentMethod] ?? data.paymentMethod),
    marginX,
    y
  );
  if (data.notes) {
    y += 5;
    doc.text(doc.splitTextToSize("Nota: " + data.notes, rightX - marginX) as string[], marginX, y);
  }

  if (data.autorizacion) {
    const a = data.autorizacion;
    // El bloque de la autorizacion: el QR a la izquierda y el codigo al lado.
    y += 10;
    if (y > 240) {
      doc.addPage();
      y = 25;
    }
    const lado = 32;
    if (a.qr) {
      try {
        const modulos = qrModulos(a.qr);
        const paso = lado / modulos.length;
        doc.setFillColor(0, 0, 0);
        modulos.forEach((fila, my) =>
          fila.forEach((negro, mx) => {
            if (negro) doc.rect(marginX + mx * paso, y + my * paso, paso, paso, "F");
          })
        );
      } catch {
        // Sin QR la factura sigue siendo valida: el codigo va escrito al lado.
      }
    }
    const textoX = a.qr ? marginX + lado + 6 : marginX;
    const ancho = rightX - textoX;
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(LEYENDA[a.pais], textoX, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    let ty = y + 9;
    const codigo = doc.splitTextToSize(a.etiquetaCodigo + ": " + a.codigo, ancho) as string[];
    doc.text(codigo, textoX, ty);
    ty += codigo.length * 3.6 + 1.5;
    const fecha = fechaCorta(a.fecha);
    if (fecha) {
      doc.text((a.pais === "CO" ? "Validada: " : "Autorizada: ") + fecha, textoX, ty);
      ty += 4;
    }
    if (a.pruebas) {
      doc.setTextColor(185, 28, 28);
      doc.setFont("helvetica", "bold");
      doc.text("AMBIENTE DE PRUEBAS - SIN VALIDEZ FISCAL", textoX, ty);
      doc.setFont("helvetica", "normal");
    }
    doc.setTextColor(110);
  }

  doc.setFontSize(8);
  doc.text("Gracias por tu compra.", marginX, 285);
  // La factura autorizada es un documento fiscal: la marca va solo en la normal.
  if (data.marcaGratis && !data.autorizacion) marcarVersionGratis(doc, rightX);

  const blob = doc.output("blob");
  return new File([blob], invoiceFileName(data), { type: "application/pdf" });
}

/**
 * La misma factura, en papel de tirilla.
 *
 * Cada producto va en dos renglones —el nombre arriba, la cantidad y el valor
 * abajo— porque en 58mm no caben lado a lado sin que el nombre quede cortado,
 * y el nombre es justo lo que el cliente revisa.
 */
export function invoiceTirilla(data: InvoiceData): Linea[] {
  const lineas: Linea[] = [{ t: "titulo", text: data.businessName }];

  if (data.businessAddress) lineas.push({ t: "centro", text: data.businessAddress, tenue: true });
  if (data.businessPhone) lineas.push({ t: "centro", text: "Tel " + data.businessPhone, tenue: true });

  lineas.push(
    { t: "sep" },
    { t: "centro", text: data.autorizacion ? "FACTURA ELECTRÓNICA DE VENTA" : "FACTURA DE VENTA", fuerte: true },
    {
      t: "centro",
      text: data.provisional ? "Registrada sin señal" : "No. " + numeroDe(data),
      tenue: true,
    },
    { t: "centro", text: prettyDay(data.day), tenue: true },
    { t: "sep" }
  );

  if (data.clientName) lineas.push({ t: "par", label: "Cliente", value: data.clientName });
  if (data.autorizacion?.compradorDocumento) lineas.push({ t: "texto", text: data.autorizacion.compradorDocumento, tenue: true });
  if (data.staffName) lineas.push({ t: "par", label: "Atendio", value: data.staffName });
  if (data.clientName || data.staffName) lineas.push({ t: "sep" });

  for (const item of data.items) {
    lineas.push({ t: "texto", text: item.name });
    lineas.push({
      t: "par",
      label: item.qty + " x " + money(item.unitPrice, data.currency),
      value: money(item.qty * item.unitPrice, data.currency),
    });
  }

  if (data.autorizacion) {
    lineas.push(
      { t: "par", label: "Subtotal", value: money(data.autorizacion.subtotal, data.currency) },
      { t: "par", label: data.autorizacion.etiquetaImpuesto, value: money(data.autorizacion.impuesto, data.currency) }
    );
  }
  lineas.push(
    { t: "total", label: "TOTAL", value: money(data.total, data.currency) },
    { t: "par", label: "Forma de pago", value: PAYMENT_LABEL[data.paymentMethod] ?? data.paymentMethod }
  );

  if (data.notes) lineas.push({ t: "espacio" }, { t: "texto", text: data.notes, tenue: true });

  if (data.autorizacion) {
    const a = data.autorizacion;
    const fecha = fechaCorta(a.fecha);
    lineas.push(
      { t: "sep" },
      { t: "centro", text: a.pais === "CO" ? "Factura electrónica validada por la DIAN" : "Comprobante autorizado por el SRI", fuerte: true },
      { t: "texto", text: a.etiquetaCodigo + ":" },
      { t: "texto", text: a.codigo, tenue: true }
    );
    if (fecha) lineas.push({ t: "centro", text: (a.pais === "CO" ? "Validada " : "Autorizada ") + fecha, tenue: true });
    if (a.pruebas) lineas.push({ t: "centro", text: "AMBIENTE DE PRUEBAS - SIN VALIDEZ FISCAL", fuerte: true });
  }

  lineas.push({ t: "sep" }, { t: "centro", text: "Gracias por su compra", tenue: true });
  if (data.marcaGratis && !data.autorizacion) lineas.push({ t: "centro", text: MARCA_VERSION_GRATIS, fuerte: true });
  lineas.push({ t: "espacio" });

  return lineas;
}
