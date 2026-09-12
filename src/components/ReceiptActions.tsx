"use client";

import { useState } from "react";
import {
  buildReceiptPdf,
  receiptFileName,
  receiptMessage,
  receiptNumber,
  receiptTirilla,
  type ReceiptData,
} from "@/lib/receipt";
import { BotonImprimir } from "./BotonImprimir";
import { Icon } from "./Icon";

function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function canShareFile(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  return typeof nav.share === "function" && Boolean(nav.canShare?.({ files: [file] }));
}

/**
 * Comprobante del abono.
 *
 * Desde el celular manda el PDF directo por WhatsApp; desde el computador lo
 * descarga y abre el chat con el texto escrito, porque el navegador no deja
 * adjuntar un archivo a un enlace.
 */
export function ReceiptActions({
  data,
  clientPhone,
}: {
  data: ReceiptData;
  clientPhone: string | null;
}) {
  const [busy, setBusy] = useState("");
  const [aviso, setAviso] = useState<{ kind: "ok" | "info" | "error"; text: string } | null>(null);

  async function conPdf(job: string, run: (file: File) => Promise<typeof aviso>) {
    setBusy(job);
    setAviso(null);
    try {
      const file = await buildReceiptPdf(data);
      setAviso(await run(file));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setAviso(null);
      } else {
        setAviso({
          kind: "error",
          text: error instanceof Error ? error.message : "No pudimos crear el comprobante.",
        });
      }
    } finally {
      setBusy("");
    }
  }

  const titulo = "Comprobante " + receiptNumber(data.paymentId) + " - " + data.businessName;

  const enviar = () =>
    conPdf("wa", async (file) => {
      if (canShareFile(file)) {
        await navigator.share({ files: [file], title: titulo, text: receiptMessage(data) });
        return { kind: "ok", text: "Comprobante enviado." };
      }
      download(file);
      const digits = (clientPhone ?? "").replace(/\D/g, "");
      window.open(
        "https://wa.me/" + digits + "?text=" + encodeURIComponent(receiptMessage(data)),
        "_blank",
        "noopener"
      );
      return {
        kind: "info",
        text: "Se abrio WhatsApp con el texto. El PDF quedo descargado: adjuntalo en el chat.",
      };
    });

  const porCorreo = () =>
    conPdf("mail", async (file) => {
      if (canShareFile(file)) {
        await navigator.share({ files: [file], title: titulo, text: receiptMessage(data) });
        return { kind: "ok", text: "Comprobante enviado." };
      }
      // En el computador no existe el menu de compartir, asi que se descarga y
      // se abre Gmail con el texto escrito para adjuntarlo.
      download(file);
      window.open(
        "https://mail.google.com/mail/?view=cm&fs=1&su=" +
          encodeURIComponent(titulo) +
          "&body=" +
          encodeURIComponent(receiptMessage(data)),
        "_blank",
        "noopener"
      );
      return {
        kind: "info",
        text: "Se abrio el correo con el texto. El PDF quedo descargado: adjuntalo antes de enviar.",
      };
    });

  const bajar = () =>
    conPdf("pdf", async (file) => {
      download(file);
      return { kind: "ok", text: "Comprobante descargado." };
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={enviar} disabled={busy !== ""} className="btn-success btn-sm">
        <Icon name="whatsapp" className="h-4 w-4" />
        {busy === "wa" ? "Preparando..." : "Mandar comprobante"}
      </button>
      <button
        type="button"
        onClick={porCorreo}
        disabled={busy !== ""}
        className="btn-ghost btn-sm"
      >
        <Icon name="link" className="h-4 w-4" />
        {busy === "mail" ? "Preparando..." : "Por correo"}
      </button>
      <BotonImprimir
        tirilla={() => receiptTirilla(data)}
        hoja={() => buildReceiptPdf(data)}
        nombreArchivo={receiptFileName(data)}
      />
      <button type="button" onClick={bajar} disabled={busy !== ""} className="btn-ghost btn-sm">
        <Icon name="download" className="h-4 w-4" />
        {busy === "pdf" ? "Creando..." : "Descargar"}
      </button>

      {aviso && (
        <p
          className={
            "w-full text-[11px] " +
            (aviso.kind === "error"
              ? "text-bad"
              : aviso.kind === "ok"
                ? "text-good"
                : "text-muted")
          }
        >
          {aviso.text}
        </p>
      )}
    </div>
  );
}
