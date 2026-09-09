import { money, prettyDay } from "./format";

/**
 * Comprobante de abono en PDF.
 *
 * Es el papel que el cliente pide cuando abona: sirve de constancia de que
 * pago y de cuanto le queda debiendo. Se arma en el navegador, igual que la
 * factura de una venta, para poder mandarlo por WhatsApp sin subirlo a ningun
 * lado.
 */
export type ReceiptData = {
  paymentId: string;
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  logoUrl: string | null;
  currency: string;
  clientName: string;
  concept: string;
  day: string;
  method: string;
  /** Lo que abono ahora. */
  amount: number;
  /** Total de la deuda y lo que queda despues de este abono. */
  total: number;
  saldo: number;
  /** Los abonos anteriores, para que el cliente vea la cuenta completa. */
  historial: { day: string; amount: number }[];
};

const PAYMENT_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

export function receiptNumber(paymentId: string): string {
  return paymentId.slice(-8).toUpperCase();
}

export function receiptFileName(data: ReceiptData): string {
  const slug = data.clientName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 24);
  return "abono-" + (slug || "cliente") + "-" + receiptNumber(data.paymentId) + ".pdf";
}

/** El texto que acompaña al comprobante cuando se manda por WhatsApp. */
export function receiptMessage(data: ReceiptData): string {
  return [
    "Hola " + data.clientName + ", te confirmamos tu abono en " + data.businessName + ".",
    "",
    "Abono: " + money(data.amount, data.currency),
    "Fecha: " + prettyDay(data.day),
    "Concepto: " + data.concept,
    "",
    data.saldo > 0
      ? "Te queda un saldo de " + money(data.saldo, data.currency) + "."
      : "Con este abono quedas al dia. Gracias.",
  ].join("\n");
}

async function loadLogo(url: string): Promise<{ data: string; format: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
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

export async function buildReceiptPdf(data: ReceiptData): Promise<File> {
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
      // Sin logo el comprobante sale igual.
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
  doc.text("COMPROBANTE DE ABONO", rightX, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("No. " + receiptNumber(data.paymentId), rightX, y + 5, { align: "right" });
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
  doc.text(data.clientName, marginX + 22, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Concepto", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(data.concept, 140) as string[], marginX + 22, y);
  y += 12;

  // El abono de hoy, destacado.
  doc.setFillColor(243, 244, 246);
  doc.rect(marginX, y - 6, rightX - marginX, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Abono recibido", marginX + 3, y + 2);
  doc.setFontSize(14);
  doc.text(money(data.amount, data.currency), rightX - 3, y + 2, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(
    "Forma de pago: " + (PAYMENT_LABEL[data.method] ?? data.method),
    marginX + 3,
    y + 7
  );
  y += 20;

  // La cuenta completa.
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Estado de la cuenta", marginX, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  const filas: [string, string][] = [
    ["Deuda total", money(data.total, data.currency)],
    ["Abonado", money(data.total - data.saldo, data.currency)],
  ];
  for (const [etiqueta, valor] of filas) {
    doc.setTextColor(110);
    doc.text(etiqueta, marginX, y);
    doc.setTextColor(0);
    doc.text(valor, rightX, y, { align: "right" });
    y += 6;
  }

  doc.setDrawColor(215);
  doc.line(marginX, y, rightX, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(data.saldo > 0 ? "SALDO PENDIENTE" : "SALDO", marginX, y);
  doc.text(money(data.saldo, data.currency), rightX, y, { align: "right" });
  y += 12;

  if (data.historial.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text("Abonos anteriores", marginX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const abono of data.historial.slice(0, 14)) {
      if (y > 265) {
        doc.addPage();
        y = 25;
      }
      doc.setTextColor(110);
      doc.text(prettyDay(abono.day), marginX, y);
      doc.setTextColor(0);
      doc.text(money(abono.amount, data.currency), rightX, y, { align: "right" });
      y += 5.5;
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(
    data.saldo > 0
      ? "Este comprobante certifica el abono recibido en la fecha indicada."
      : "Cuenta saldada. Gracias por tu pago.",
    marginX,
    285
  );

  const blob = doc.output("blob");
  return new File([blob], receiptFileName(data), { type: "application/pdf" });
}
