import { db } from "../db";
import { mailEnabled, sendMail } from "../mail";
import type { Comprador } from "./paises";
import { dolares, fechaConHora, leerFacturaAutorizada, nombreRide, rideFacturaPdf, type FacturaRide } from "./sri/ride";

/**
 * La factura del SRI por correo al comprador: el RIDE en PDF y el XML
 * autorizado, que es lo que el comprador necesita para su contabilidad (lo
 * pidio Chopo Snacks, ver lib/facturacion/sri).
 *
 * Sale sola apenas el SRI la autoriza, si el comprador dejo correo, y una sola
 * vez. Desde la venta se puede volver a mandar, o mandar a otro correo.
 */

const CORREO_VALIDO = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export type ArchivosFactura = { factura: FacturaRide; pdf: Uint8Array<ArrayBuffer>; nombrePdf: string; xml: string };

/** El RIDE y el XML de una factura autorizada directo con el SRI, de este negocio. */
export async function archivosDeFactura(id: string, userId: string): Promise<ArchivosFactura | null> {
  const f = await db.electronicInvoice.findFirst({
    where: { id, userId, provider: "sri", status: "AUTORIZADA" },
    select: {
      xml: true,
      user: { select: { logo: true, phone: true, email: true, billingConfig: { select: { artisanNumber: true } } } },
    },
  });
  if (!f?.xml) return null;
  const factura = leerFacturaAutorizada(f.xml);
  const pdf = await rideFacturaPdf(factura, {
    logo: f.user.logo,
    telefono: f.user.phone,
    correo: f.user.email,
    calificacionArtesanal: f.user.billingConfig?.artisanNumber,
  });
  return { factura, pdf, nombrePdf: nombreRide(factura), xml: f.xml };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function mensaje(factura: FacturaRide, negocio: string) {
  const filas: [string, string][] = [
    ["Factura", factura.numero],
    ["Fecha de emisión", fechaConHora(factura)],
    ["Valor total", dolares(factura.importeTotal)],
    ["Clave de acceso", factura.claveAcceso],
  ];
  const cliente = factura.comprador.razonSocial || "cliente";
  const text = [
    "Estimado(a) " + cliente + ":",
    "",
    negocio + " le envía su factura electrónica autorizada por el SRI.",
    "",
    ...filas.map(([k, v]) => k + ": " + v),
    "",
    "Adjuntamos el comprobante en PDF (RIDE) y el archivo XML.",
    ...(factura.produccion ? [] : ["", "Ambiente de pruebas: este comprobante no tiene validez tributaria."]),
  ].join("\n");
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">' +
    "<p>Estimado(a) " + esc(cliente) + ":</p>" +
    "<p><b>" + esc(negocio) + "</b> le envía su factura electrónica autorizada por el SRI.</p>" +
    '<table style="border-collapse:collapse;margin:8px 0">' +
    filas
      .map(([k, v]) => '<tr><td style="padding:3px 12px 3px 0;color:#555">' + esc(k) + '</td><td style="padding:3px 0"><b>' + esc(v) + "</b></td></tr>")
      .join("") +
    "</table>" +
    "<p>Adjuntamos el comprobante en PDF (RIDE) y el archivo XML.</p>" +
    (factura.produccion ? "" : "<p><b>Ambiente de pruebas:</b> este comprobante no tiene validez tributaria.</p>") +
    "</div>";
  return { text, html };
}

export type EnvioCorreo = { ok: true; para: string } | { ok: false; error: string };

/** Manda la factura a `para`, o al correo que dejo el comprador. */
export async function enviarFacturaPorCorreo(id: string, userId: string, para?: string | null): Promise<EnvioCorreo> {
  const fila = await db.electronicInvoice.findFirst({
    where: { id, userId },
    select: {
      status: true,
      provider: true,
      customer: true,
      user: { select: { businessName: true, email: true, billingConfig: { select: { tradeName: true } } } },
    },
  });
  if (!fila) return { ok: false, error: "No encontramos esa factura." };
  if (fila.provider !== "sri" || fila.status !== "AUTORIZADA") {
    return { ok: false, error: "Solo se manda por correo la factura ya autorizada por el SRI." };
  }
  const comprador = fila.customer as unknown as Comprador;
  const destino = (para ?? "").trim() || (comprador?.correo ?? "").trim();
  if (!destino) return { ok: false, error: "Escribe el correo del cliente." };
  if (!CORREO_VALIDO.test(destino) || destino.length > 200) return { ok: false, error: "Ese correo no parece válido." };
  if (!mailEnabled()) return { ok: false, error: "El correo de la plataforma no está configurado. Avísale al administrador." };

  const archivos = await archivosDeFactura(id, userId);
  if (!archivos) return { ok: false, error: "No encontramos el XML autorizado de esa factura." };

  const negocio = fila.user.billingConfig?.tradeName || fila.user.businessName;
  const { text, html } = mensaje(archivos.factura, negocio);
  const salio = await sendMail({
    to: destino,
    subject: "Factura electrónica " + archivos.factura.numero + " · " + negocio,
    text,
    html,
    fromName: negocio,
    replyTo: fila.user.email,
    attachments: [
      { filename: archivos.nombrePdf, content: archivos.pdf, contentType: "application/pdf" },
      {
        filename: archivos.nombrePdf.replace(/\.pdf$/, ".xml"),
        content: new TextEncoder().encode(archivos.xml),
        contentType: "application/xml",
      },
    ],
  });
  if (!salio) return { ok: false, error: "No se pudo mandar el correo. Inténtalo otra vez en un momento." };

  await db.electronicInvoice.update({ where: { id }, data: { emailedTo: destino, emailedAt: new Date() } });
  return { ok: true, para: destino };
}

/**
 * El envio automatico, apenas queda autorizada: solo si el comprador dejo
 * correo, la plataforma tiene correo y no se ha mandado antes. Se aparta
 * antes de mandar, para que dos consultas a la vez no lo manden dos veces.
 */
export async function correoAutomatico(id: string): Promise<void> {
  if (!mailEnabled()) return;
  const f = await db.electronicInvoice.findUnique({
    where: { id },
    select: { userId: true, provider: true, status: true, emailedAt: true, customer: true },
  });
  const correo = ((f?.customer as unknown as Comprador | null)?.correo ?? "").trim();
  if (!f || f.provider !== "sri" || f.status !== "AUTORIZADA" || f.emailedAt || !correo) return;

  const apartada = await db.electronicInvoice.updateMany({
    where: { id, emailedAt: null },
    data: { emailedAt: new Date(), emailedTo: correo },
  });
  if (apartada.count === 0) return;

  const r = await enviarFacturaPorCorreo(id, f.userId, correo).catch(() => null);
  if (!r?.ok) {
    // No salio: queda como no enviada, y desde la venta se puede mandar a mano.
    await db.electronicInvoice.update({ where: { id }, data: { emailedAt: null, emailedTo: null } });
  }
}
