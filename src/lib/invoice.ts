import { money, prettyDay } from "./format";

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
};

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

export function invoiceFileName(data: InvoiceData): string {
  const slug = data.businessName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 30);
  return "factura-" + (slug || "venta") + "-" + invoiceNumber(data.saleId) + ".pdf";
}

/** El texto que acompaña a la factura en WhatsApp o en el correo. */
export function invoiceMessage(data: InvoiceData): string {
  const lines = [
    "Factura " + invoiceNumber(data.saleId) + " - " + data.businessName,
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
  doc.text("FACTURA DE VENTA", rightX, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("No. " + invoiceNumber(data.saleId), rightX, y + 5, { align: "right" });
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

  doc.setFontSize(8);
  doc.text("Gracias por tu compra.", marginX, 285);

  const blob = doc.output("blob");
  return new File([blob], invoiceFileName(data), { type: "application/pdf" });
}
