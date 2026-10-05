/**
 * Dibujar las paginas de un PDF en el navegador, con pdf.js.
 *
 * Se baja solo cuando alguien abre un documento para firmar. El trabajador de
 * fondo lo sirve la aplicacion misma (ver scripts/copiar-pdfjs.mjs): la ruta
 * lleva la version instalada y el script revisa que coincida.
 */

import type { PDFDocumentProxy } from "pdfjs-dist";

const TRABAJADOR = "/pdfjs/4.10.38/pdf.worker.min.mjs";

let cargado: Promise<typeof import("pdfjs-dist")> | null = null;

function pdfjs() {
  if (!cargado) {
    cargado = import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
      const lib = m as unknown as typeof import("pdfjs-dist");
      lib.GlobalWorkerOptions.workerSrc = TRABAJADOR;
      return lib;
    });
  }
  return cargado;
}

export async function abrirPdf(url: string): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  return lib.getDocument({ url, isEvalSupported: false }).promise;
}

/**
 * Dibuja una pagina al ancho pedido, en pixeles de pantalla. Devuelve la
 * proporcion alto/ancho de la pagina tal como se ve (ya girada).
 */
export async function dibujarPagina(pdf: PDFDocumentProxy, numero: number, canvas: HTMLCanvasElement, ancho: number): Promise<number> {
  const pagina = await pdf.getPage(numero);
  const base = pagina.getViewport({ scale: 1 });
  // Nitida en pantallas de celular, sin pasarse: una pagina a 3x pesa mucho.
  const densidad = Math.min(2, window.devicePixelRatio || 1);
  const vista = pagina.getViewport({ scale: (ancho / base.width) * densidad });
  canvas.width = Math.floor(vista.width);
  canvas.height = Math.floor(vista.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return base.height / base.width;
  await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
  return base.height / base.width;
}
