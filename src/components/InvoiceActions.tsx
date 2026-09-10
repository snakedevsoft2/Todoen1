"use client";

import { useState } from "react";
import { buildInvoicePdf, invoiceMessage, invoiceNumber, type InvoiceData } from "@/lib/invoice";
import { Icon } from "./Icon";

/** Baja el archivo al dispositivo, para poder adjuntarlo a mano. */
function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Le damos un momento al navegador antes de soltar la memoria.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** El celular puede mandar el PDF directo a WhatsApp o a Gmail. */
function canShareFile(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  return typeof nav.share === "function" && Boolean(nav.canShare?.({ files: [file] }));
}

type Feedback = { kind: "ok" | "info" | "error"; text: string } | null;

/**
 * Factura en PDF de una venta.
 *
 * En el celular abre el menu de compartir con el PDF ya adjunto, que es la
 * forma de mandarlo por WhatsApp o Gmail sin subirlo a ningun lado. En el
 * computador no existe ese menu, asi que descarga el PDF y abre el chat o el
 * correo con el texto escrito, listo para adjuntarlo.
 */
export function InvoiceActions({
  data,
  defaultPhone,
}: {
  data: InvoiceData;
  /** Telefono del cliente, si la venta lo tiene guardado. */
  defaultPhone?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function withPdf(job: string, run: (file: File) => Promise<Feedback>) {
    setBusy(job);
    setFeedback(null);
    try {
      const file = await buildInvoicePdf(data);
      setFeedback(await run(file));
    } catch (error) {
      // Cancelar el menu de compartir tira un error: no es una falla real.
      if (error instanceof DOMException && error.name === "AbortError") {
        setFeedback(null);
      } else {
        setFeedback({
          kind: "error",
          text: error instanceof Error ? error.message : "No se pudo crear la factura.",
        });
      }
    } finally {
      setBusy("");
    }
  }

  const title = "Factura " + invoiceNumber(data.saleId) + " - " + data.businessName;

  const onDownload = () =>
    withPdf("pdf", async (file) => {
      download(file);
      return { kind: "ok", text: "Factura descargada." };
    });

  const onWhatsapp = () =>
    withPdf("wa", async (file) => {
      if (canShareFile(file)) {
        await navigator.share({ files: [file], title, text: invoiceMessage(data) });
        return { kind: "ok", text: "Factura enviada." };
      }
      download(file);
      const digits = phone.replace(/\D/g, "");
      const url =
        "https://wa.me/" + digits + "?text=" + encodeURIComponent(invoiceMessage(data));
      window.open(url, "_blank", "noopener");
      return {
        kind: "info",
        text: "Se abrio WhatsApp con el resumen. El PDF quedo descargado: adjuntalo en el chat.",
      };
    });

  const onEmail = () =>
    withPdf("mail", async (file) => {
      if (canShareFile(file)) {
        await navigator.share({ files: [file], title, text: invoiceMessage(data) });
        return { kind: "ok", text: "Factura enviada." };
      }
      download(file);
      const url =
        "https://mail.google.com/mail/?view=cm&fs=1" +
        "&to=" +
        encodeURIComponent(email) +
        "&su=" +
        encodeURIComponent(title) +
        "&body=" +
        encodeURIComponent(invoiceMessage(data));
      window.open(url, "_blank", "noopener");
      return {
        kind: "info",
        text: "Se abrio Gmail con el correo escrito. El PDF quedo descargado: adjuntalo antes de enviar.",
      };
    });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost btn-sm">
        <Icon name="receipt" className="h-4 w-4" />
        Factura
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-line bg-panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-strong">
          Factura {invoiceNumber(data.saleId)}
        </p>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm px-2">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">WhatsApp del cliente</span>
          <input
            className="input py-1.5 text-sm"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="573000000000"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">Correo del cliente</span>
          <input
            className="input py-1.5 text-sm"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@correo.com"
          />
        </label>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onWhatsapp}
          disabled={busy !== ""}
          className="btn-success btn-sm"
        >
          <Icon name="whatsapp" className="h-4 w-4" />
          {busy === "wa" ? "Preparando..." : "Enviar por WhatsApp"}
        </button>
        <button type="button" onClick={onEmail} disabled={busy !== ""} className="btn-ghost btn-sm">
          <Icon name="link" className="h-4 w-4" />
          {busy === "mail" ? "Preparando..." : "Enviar por correo"}
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy !== ""}
          className="btn-ghost btn-sm"
        >
          <Icon name="print" className="h-4 w-4" />
          {busy === "pdf" ? "Creando..." : "Descargar PDF"}
        </button>
      </div>

      {feedback && (
        <p
          className={
            "mt-2 text-[11px] " +
            (feedback.kind === "error"
              ? "text-bad"
              : feedback.kind === "ok"
                ? "text-good"
                : "text-muted")
          }
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
