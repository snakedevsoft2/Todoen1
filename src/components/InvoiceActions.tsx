"use client";

import { useMemo, useRef, useState } from "react";
import { coincideBusqueda } from "@/lib/categorias";
import {
  buildInvoicePdf,
  invoiceFileName,
  invoiceMessage,
  invoiceTirilla,
  numeroDe,
  type InvoiceData,
} from "@/lib/invoice";
import { BotonImprimir } from "./BotonImprimir";
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

export type ClienteFactura = { id: string; name: string; phone: string | null };

/** Cuantos se pintan a la vez: con miles de clientes no hay que mostrarlos todos. */
const MAX_VISIBLES = 20;

/**
 * Escoger a quien se le manda la factura, de los clientes ya guardados.
 *
 * Se busca por nombre o por telefono. Al escoger uno se llena el numero solo,
 * que es de lo que se trata: no tener que acordarse del telefono de nadie.
 *
 * Quien no este guardado no es un problema: el campo del numero se escribe a
 * mano igual, y se manda lo mismo. Por eso esto no es obligatorio ni bloquea
 * nada, es solo un atajo.
 */
function ElegirCliente({
  clientes,
  onElegir,
}: {
  clientes: ClienteFactura[];
  onElegir: (c: ClienteFactura) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  const opciones = useMemo(() => {
    const lista = texto.trim()
      ? clientes.filter((c) => coincideBusqueda([c.name, c.phone], texto))
      : clientes;
    return lista.slice(0, MAX_VISIBLES);
  }, [clientes, texto]);

  return (
    <div ref={caja} className="relative">
      <span className="mb-1 block text-[11px] text-muted">Buscar un cliente guardado</span>
      <input
        className="input py-1.5 text-sm"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Nombre o teléfono"
        autoComplete="off"
      />
      {abierto && opciones.length > 0 && (
        <ul
          data-lista-clientes-factura
          className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-soft-lg"
        >
          {opciones.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onElegir(c);
                  setTexto(c.name);
                  setAbierto(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-strong hover:bg-surface"
              >
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-[11px] text-subtle">
                  {c.phone || "sin teléfono"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {abierto && texto.trim() && opciones.length === 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-line bg-panel p-2.5 text-[12px] text-subtle shadow-soft-lg">
          Ese cliente no está guardado. Escribe su número abajo y se le manda igual.
        </div>
      )}
    </div>
  );
}

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
  clientes = [],
  soloBluetooth = false,
}: {
  data: InvoiceData;
  /** Telefono del cliente, si la venta lo tiene guardado. */
  defaultPhone?: string | null;
  /** Los clientes guardados, para escoger a quien mandarle la factura. */
  clientes?: ClienteFactura[];
  /** El empleado solo imprime por la termica de mostrador, sin dialogo. */
  soloBluetooth?: boolean;
}) {
  // La venta guarda el nombre del cliente pero no su telefono. Si ese nombre
  // es de alguien que ya esta en Clientes, se arranca con su numero puesto:
  // es el caso normal y ahorra tener que buscarlo.
  const conocido = useMemo(() => {
    const nombre = data.clientName?.trim().toLowerCase();
    if (!nombre) return null;
    return clientes.find((c) => c.name.trim().toLowerCase() === nombre) ?? null;
  }, [clientes, data.clientName]);

  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? conocido?.phone ?? "");
  const [destino, setDestino] = useState<string | null>(conocido?.name ?? null);
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

  // El mismo numero que sale impreso (0001, 0002...), no el codigo del id: ver
  // numeroDe() en lib/invoice.ts.
  const title = "Factura " + numeroDe(data) + " - " + data.businessName;

  const onDownload = () =>
    withPdf("pdf", async (file) => {
      download(file);
      return { kind: "ok", text: "Factura descargada." };
    });

  // Abre el PDF en una pestaña nueva, sin guardarlo en el dispositivo. El
  // navegador la revoca sola al cerrar la pestaña; le damos un minuto de
  // margen antes por si tarda en cargar.
  const onView = () =>
    withPdf("ver", async (file) => {
      const url = URL.createObjectURL(file);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { kind: "ok", text: "Factura abierta en una pestaña nueva." };
    });

  const onWhatsapp = () =>
    withPdf("wa", async (file) => {
      const digits = phone.replace(/\D/g, "");
      // En el celular el menu de compartir manda el PDF ya adjunto, que es lo
      // mejor que hay: el numero no se le puede pasar, se escoge el chat ahi.
      if (canShareFile(file)) {
        await navigator.share({ files: [file], title, text: invoiceMessage(data) });
        return {
          kind: "ok",
          text: destino ? "Factura compartida. Escoge a " + destino + " en WhatsApp." : "Factura enviada.",
        };
      }
      // Sin numero, wa.me abre WhatsApp sin destinatario y la persona cree que
      // no funciono. Mejor decirlo antes de abrir nada.
      if (!digits) {
        return {
          kind: "error",
          text: "Escribe el número de WhatsApp (o escoge un cliente guardado) para poder mandársela.",
        };
      }
      download(file);
      const url = "https://wa.me/" + digits + "?text=" + encodeURIComponent(invoiceMessage(data));
      window.open(url, "_blank", "noopener");
      return {
        kind: "info",
        text:
          "Se abrió el chat de " +
          (destino ?? digits) +
          " con el resumen. El PDF quedó descargado: adjúntalo en el chat.",
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
        <p className="text-xs font-semibold text-strong">Factura {numeroDe(data)}</p>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm px-2">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>

      {clientes.length > 0 && (
        <div className="mb-2">
          <ElegirCliente
            clientes={clientes}
            onElegir={(c) => {
              setDestino(c.name);
              setPhone(c.phone ?? "");
              setFeedback(
                c.phone
                  ? null
                  : { kind: "info", text: c.name + " no tiene teléfono guardado: escríbelo abajo." }
              );
            }}
          />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">
            WhatsApp del cliente{destino ? " · " + destino : ""}
          </span>
          <input
            className="input py-1.5 text-sm"
            inputMode="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setDestino(null);
            }}
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
        <BotonImprimir
          tirilla={() => invoiceTirilla(data)}
          logoUrl={data.logoUrl}
          nombreArchivo={invoiceFileName(data)}
          soloBluetooth={soloBluetooth}
        />
        <button type="button" onClick={onView} disabled={busy !== ""} className="btn-ghost btn-sm">
          <Icon name="eye" className="h-4 w-4" />
          {busy === "ver" ? "Abriendo..." : "Ver factura"}
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy !== ""}
          className="btn-ghost btn-sm"
        >
          <Icon name="download" className="h-4 w-4" />
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
