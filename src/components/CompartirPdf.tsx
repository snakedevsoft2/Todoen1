"use client";

import { useState } from "react";
import { imprimirPdf } from "@/lib/imprimir";
import {
  construirInformePdf,
  construirPlanillaPdf,
  mensajeInforme,
  mensajePlanilla,
  type InformeDatos,
  type PlanillaDatos,
} from "@/lib/informe-pdf";
import { Icon } from "./Icon";

function descargar(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function puedeCompartirArchivo(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  return typeof nav.share === "function" && Boolean(nav.canShare?.({ files: [file] }));
}

/**
 * Mandar por WhatsApp, descargar o imprimir un PDF.
 *
 * En el celular el PDF se adjunta de una vez con el menu de compartir. En el
 * computador ese menu no existe: se descarga y se abre el chat con el texto
 * escrito, para adjuntarlo. Es la misma regla de la factura.
 */
function CompartirPdf({
  construir,
  mensaje,
  telefono,
  titulo,
  etiquetaDescargar,
}: {
  construir: () => Promise<File>;
  mensaje: string;
  telefono?: string | null;
  titulo: string;
  etiquetaDescargar: string;
}) {
  const [ocupado, setOcupado] = useState("");
  const [aviso, setAviso] = useState<{ tono: "ok" | "info" | "error"; texto: string } | null>(null);

  async function correr(tarea: string, fn: (f: File) => Promise<typeof aviso>) {
    setOcupado(tarea);
    setAviso(null);
    try {
      setAviso(await fn(await construir()));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setAviso(null);
      else
        setAviso({
          tono: "error",
          texto: error instanceof Error ? error.message : "No se pudo armar el PDF.",
        });
    } finally {
      setOcupado("");
    }
  }

  const whatsapp = () =>
    correr("wa", async (file) => {
      if (puedeCompartirArchivo(file)) {
        await navigator.share({ files: [file], title: titulo, text: mensaje });
        return { tono: "ok", texto: "Enviado." };
      }
      descargar(file);
      const numero = (telefono ?? "").replace(/\D/g, "");
      window.open(
        "https://wa.me/" + numero + "?text=" + encodeURIComponent(mensaje),
        "_blank",
        "noopener"
      );
      return {
        tono: "info",
        texto: "Se abrio WhatsApp con el texto. El PDF quedo descargado: adjuntalo en el chat.",
      };
    });

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={whatsapp} disabled={ocupado !== ""} className="btn-success btn-sm">
          <Icon name="whatsapp" className="h-4 w-4" />
          {ocupado === "wa" ? "Armando PDF..." : "Enviar por WhatsApp"}
        </button>
        <button
          type="button"
          onClick={() =>
            correr("pdf", async (file) => {
              descargar(file);
              return { tono: "ok", texto: "PDF descargado." };
            })
          }
          disabled={ocupado !== ""}
          className="btn-ghost btn-sm"
        >
          <Icon name="download" className="h-4 w-4" />
          {ocupado === "pdf" ? "Armando PDF..." : etiquetaDescargar}
        </button>
        <button
          type="button"
          onClick={() =>
            correr("imp", async (file) => {
              const como = await imprimirPdf(file);
              return como === "dialogo"
                ? null
                : { tono: "info", texto: "Se abrio el PDF aparte: imprimelo desde ahi." };
            })
          }
          disabled={ocupado !== ""}
          className="btn-ghost btn-sm"
        >
          <Icon name="print" className="h-4 w-4" />
          {ocupado === "imp" ? "Preparando..." : "Imprimir"}
        </button>
      </div>
      {aviso && (
        <p
          className={
            "mt-2 text-[11px] " +
            (aviso.tono === "error" ? "text-bad" : aviso.tono === "ok" ? "text-good" : "text-muted")
          }
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}

/*
 * Envoltorios con los datos ya planos.
 *
 * Una pagina del servidor no le puede pasar una funcion a un componente del
 * navegador, solo datos. Por eso la funcion que arma el PDF se escoge aqui
 * adentro, y la pagina solo manda el reporte o la planilla.
 */

export function AccionesInforme({
  datos,
  telefono,
}: {
  datos: InformeDatos;
  telefono: string | null;
}) {
  return (
    <CompartirPdf
      construir={() => construirInformePdf(datos)}
      mensaje={mensajeInforme(datos)}
      telefono={telefono}
      titulo={datos.title}
      etiquetaDescargar="Descargar PDF"
    />
  );
}

export function AccionesPlanilla({ datos }: { datos: PlanillaDatos }) {
  return (
    <CompartirPdf
      construir={() => construirPlanillaPdf(datos)}
      mensaje={mensajePlanilla(datos)}
      titulo={"Planilla " + datos.rango}
      etiquetaDescargar="Descargar planilla"
    />
  );
}
