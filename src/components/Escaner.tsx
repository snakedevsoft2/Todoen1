"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MODOS, aplicarModo, nombreDocumento, type Modo } from "@/lib/escaner";
import { fileToDataUrl } from "@/lib/image";
import { OCR, archivosOcrParaEsteEquipo } from "@/lib/ocr";
import { enviar } from "@/lib/cola-reportes";
import {
  borrarDocumentoPendiente,
  cuerpoDeDocumento,
  documentosPendientes,
  guardarDocumentoPendiente,
  nuevaLlave,
  subirDocumentos,
  type DocumentoPendiente,
} from "@/lib/cola-pendientes";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";
import { RegistrarSW } from "./RegistrarSW";

/**
 * Lo que la pantalla solo baja al usarlo: se carga con senal para que el PDF
 * y el paso a texto funcionen despues sin ella.
 */
async function precargarEscaner(): Promise<string[]> {
  await Promise.all([import("jspdf"), import("tesseract.js")]);
  return archivosOcrParaEsteEquipo();
}

const MAX_PAGINAS = 20;
const MAX_BYTES_GUARDAR = 3 * 1024 * 1024;

type Pagina = {
  id: string;
  /** La foto como llego, ya achicada. */
  original: string;
  rotacion: 0 | 90 | 180 | 270;
  modo: Modo;
  /** Como queda con el giro y el modo. Es lo que va al PDF y al texto. */
  lista: string | null;
};

async function procesar(fuente: string, rotacion: number, modo: Modo): Promise<string> {
  const img = await createImageBitmap(await (await fetch(fuente)).blob());
  const escala = Math.min(1, 1800 / Math.max(img.width, img.height));
  const w = Math.round(img.width * escala);
  const h = Math.round(img.height * escala);
  const girada = rotacion % 180 !== 0;
  const lienzo = document.createElement("canvas");
  lienzo.width = girada ? h : w;
  lienzo.height = girada ? w : h;
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No se pudo procesar la foto.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.translate(lienzo.width / 2, lienzo.height / 2);
  ctx.rotate((rotacion * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  img.close?.();
  if (modo !== "color") {
    const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    aplicarModo(datos.data, modo);
    ctx.putImageData(datos, 0, 0);
  }
  return lienzo.toDataURL("image/jpeg", 0.8);
}

async function medir(dataUrl: string): Promise<{ w: number; h: number }> {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const r = { w: bmp.width, h: bmp.height };
  bmp.close?.();
  return r;
}

async function armarPdf(paginas: string[], titulo: string): Promise<File> {
  const { jsPDF } = await import("jspdf");
  let doc: InstanceType<typeof jsPDF> | null = null;
  for (const p of paginas) {
    const { w, h } = await medir(p);
    const horizontal = w > h;
    const [ANCHO, ALTO] = horizontal ? [297, 210] : [210, 297];
    if (!doc) doc = new jsPDF({ unit: "mm", format: "a4", orientation: horizontal ? "landscape" : "portrait" });
    else doc.addPage("a4", horizontal ? "landscape" : "portrait");
    const M = 6;
    const escala = Math.min((ANCHO - M * 2) / w, (ALTO - M * 2) / h);
    doc.addImage(p, "JPEG", (ANCHO - w * escala) / 2, (ALTO - h * escala) / 2, w * escala, h * escala);
  }
  if (!doc) throw new Error("No hay páginas.");
  return new File([doc.output("blob")], nombreDocumento(titulo, "pdf"), { type: "application/pdf" });
}

function descargar(archivo: Blob, nombre: string) {
  const url = URL.createObjectURL(archivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function leerComoDataUrl(archivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(archivo);
  });
}

/**
 * El escaner: fotos de un documento -> PDF o texto.
 *
 * Todo pasa en el telefono: el giro, el modo documento, el PDF y la lectura
 * del texto. Al servidor solo llega el PDF terminado, y solo si se guarda.
 *
 * Funciona sin senal si la pantalla se abrio antes con ella: el PDF y el texto
 * se hacen igual, y lo que se guarda queda en el telefono y se sube solo.
 */
export function Escaner({ hoy, cuenta }: { hoy: string; cuenta: string }) {
  const router = useRouter();
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [titulo, setTitulo] = useState("Documento " + hoy);
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [texto, setTexto] = useState("");
  const [progreso, setProgreso] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [pendientes, setPendientes] = useState<DocumentoPendiente[]>([]);
  const [enLinea, setEnLinea] = useState(true);

  const refrescar = useCallback(async () => {
    try {
      setPendientes(await documentosPendientes(cuenta));
    } catch {
      // Sin IndexedDB no hay cola; el aviso sale al intentar guardar sin senal.
    }
  }, [cuenta]);

  const subir = useCallback(async () => {
    try {
      const r = await subirDocumentos(cuenta, () => void refrescar());
      await refrescar();
      if (r.enviados > 0) {
        setMensaje({
          kind: "ok",
          text:
            r.enviados === 1
              ? "Volvió la señal: el documento guardado en el teléfono ya se subió."
              : "Volvió la señal: " + r.enviados + " documentos guardados en el teléfono ya se subieron.",
        });
        router.refresh();
      } else if (r.aviso) {
        setMensaje({ kind: "error", text: r.aviso });
      }
    } catch {
      // Se reintenta en el proximo evento.
    }
  }, [cuenta, refrescar, router]);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    void refrescar().then(() => {
      if (navigator.onLine) void subir();
    });
    const volvio = () => {
      setEnLinea(true);
      void subir();
    };
    const cayo = () => setEnLinea(false);
    const alVolver = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void subir();
    };
    window.addEventListener("online", volvio);
    window.addEventListener("offline", cayo);
    document.addEventListener("visibilitychange", alVolver);
    const reloj = setInterval(() => {
      if (navigator.onLine) void subir();
    }, 30_000);
    return () => {
      window.removeEventListener("online", volvio);
      window.removeEventListener("offline", cayo);
      document.removeEventListener("visibilitychange", alVolver);
      clearInterval(reloj);
    };
  }, [refrescar, subir]);

  // Cada vez que cambia el giro o el modo de una pagina, se vuelve a procesar
  // solo esa. El PDF armado deja de valer.
  useEffect(() => {
    const pendientes = paginas.filter((p) => p.lista === null);
    if (pendientes.length === 0) return;
    let vivo = true;
    (async () => {
      for (const p of pendientes) {
        try {
          const lista = await procesar(p.original, p.rotacion, p.modo);
          if (!vivo) return;
          setPaginas((todas) => todas.map((x) => (x.id === p.id && x.lista === null ? { ...x, lista } : x)));
        } catch {
          setMensaje({ kind: "error", text: "No se pudo procesar una de las fotos." });
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [paginas]);

  const listas = paginas.every((p) => p.lista !== null);

  function cambiar(id: string, cambio: Partial<Pick<Pagina, "rotacion" | "modo">>) {
    setPdf(null);
    setPaginas((todas) => todas.map((p) => (p.id === id ? { ...p, ...cambio, lista: null } : p)));
  }

  function mover(i: number, delta: number) {
    setPdf(null);
    setPaginas((todas) => {
      const j = i + delta;
      if (j < 0 || j >= todas.length) return todas;
      const copia = [...todas];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  async function agregar(lista: FileList | null) {
    if (!lista?.length) return;
    setOcupado("Preparando fotos…");
    setMensaje(null);
    const nuevas: Pagina[] = [];
    for (const archivo of Array.from(lista).slice(0, MAX_PAGINAS - paginas.length)) {
      try {
        nuevas.push({
          id: Math.random().toString(36).slice(2),
          original: await fileToDataUrl(archivo, { maxSide: 2200, maxBytes: 1500 * 1024 }),
          rotacion: 0,
          modo: "documento",
          lista: null,
        });
      } catch {
        setMensaje({ kind: "error", text: "Una de las imágenes no se pudo leer." });
      }
    }
    setPdf(null);
    setPaginas((p) => [...p, ...nuevas]);
    setOcupado(null);
  }

  async function crearPdf(): Promise<File | null> {
    if (!listas || paginas.length === 0) return null;
    setOcupado("Armando el PDF…");
    try {
      const archivo = await armarPdf(paginas.map((p) => p.lista as string), titulo);
      setPdf(archivo);
      return archivo;
    } catch (e) {
      setMensaje({ kind: "error", text: e instanceof Error ? e.message : "No se pudo armar el PDF." });
      return null;
    } finally {
      setOcupado(null);
    }
  }

  async function compartir() {
    const archivo = pdf ?? (await crearPdf());
    if (!archivo) return;
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (typeof nav.share === "function" && nav.canShare?.({ files: [archivo] })) {
      try {
        await nav.share({ files: [archivo], title: titulo });
      } catch {
        // Cancelado.
      }
    } else {
      descargar(archivo, archivo.name);
      setMensaje({ kind: "info", text: "Este equipo no deja compartir directo: el PDF quedó descargado." });
    }
  }

  async function pasarATexto() {
    if (!listas || paginas.length === 0) return;
    setMensaje(null);
    setProgreso(0);
    try {
      const { createWorker } = await import("tesseract.js");
      const total = paginas.length;
      let actual = 0;
      // Todo sale de la propia aplicacion y no de un CDN, para que funcione sin
      // senal: el trabajador de fondo ya guardo estos archivos.
      const worker = await createWorker("spa", 1, {
        workerPath: OCR.worker,
        corePath: OCR.carpeta,
        langPath: OCR.carpeta,
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setProgreso(Math.round(((actual + m.progress) / total) * 100));
        },
      });
      const partes: string[] = [];
      for (const p of paginas) {
        const { data } = await worker.recognize(p.lista as string);
        partes.push(data.text.trim());
        actual += 1;
      }
      await worker.terminate();
      setTexto(partes.map((t, i) => (total > 1 ? "— Página " + (i + 1) + " —\n" : "") + t).join("\n\n"));
      setMensaje({ kind: "ok", text: "Listo. Revisa el texto: puedes corregirlo antes de copiarlo o guardarlo." });
    } catch {
      setMensaje({
        kind: "error",
        text: navigator.onLine
          ? "No se pudo leer el texto. Vuelve a intentarlo."
          : "No se pudo leer el texto sin señal. Abre el escáner una vez con internet para que quede listo en este teléfono.",
      });
    } finally {
      setProgreso(null);
    }
  }

  async function guardar() {
    const archivo = pdf ?? (await crearPdf());
    if (!archivo) return;
    if (archivo.size > MAX_BYTES_GUARDAR) {
      setMensaje({ kind: "error", text: "El PDF pesa más de 3 MB: descárgalo, o guárdalo con menos páginas." });
      return;
    }
    setOcupado("Guardando…");
    setMensaje(null);
    try {
      const doc: DocumentoPendiente = {
        clientKey: nuevaLlave(),
        cuenta,
        title: titulo,
        pdf: await leerComoDataUrl(archivo),
        pages: paginas.length,
        text: texto,
        creadoEn: new Date().toISOString(),
        error: null,
      };
      let aviso = "Sin señal: el documento quedó guardado en este teléfono y se sube solo cuando vuelva.";
      if (navigator.onLine) {
        const p = await enviar("/api/documentos", cuerpoDeDocumento(doc));
        if (p.ok) {
          setMensaje({ kind: "ok", text: "Guardado en tus documentos." });
          router.refresh();
          return;
        }
        if (!p.reintentar) {
          setMensaje({ kind: "error", text: p.motivo });
          return;
        }
        if (p.conRed) aviso = p.motivo + " El documento quedó guardado en este teléfono.";
      }

      // Sin red, o el servidor no respondio: a la cola, con la misma llave.
      try {
        await guardarDocumentoPendiente(doc);
      } catch {
        setMensaje({ kind: "error", text: "Sin señal y este navegador no deja guardar el documento. Descarga el PDF." });
        return;
      }
      await refrescar();
      setMensaje({ kind: "info", text: aviso });
    } finally {
      setOcupado(null);
    }
  }

  async function descartar(clientKey: string) {
    await borrarDocumentoPendiente(clientKey);
    await refrescar();
  }

  function empezarOtro() {
    setPaginas([]);
    setPdf(null);
    setTexto("");
    setMensaje(null);
    setTitulo("Documento " + hoy);
  }

  return (
    <div className="space-y-4">
      <RegistrarSW guardarEstaPagina precargar={precargarEscaner} />

      {!enLinea && (
        <p data-sin-senal className="rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-[13px] text-warn">
          Sin señal: puedes escanear, armar el PDF y pasar a texto. Lo que guardes se sube solo cuando vuelva.
        </p>
      )}

      {pendientes.length > 0 && (
        <div data-documentos-pendientes className="rounded-xl border border-warn-line bg-warn-soft p-3">
          <p className="flex items-center gap-2 text-[13px] font-bold text-warn">
            <Icon name="clock" className="h-4 w-4" />
            {pendientes.length === 1 ? "1 documento por subir" : pendientes.length + " documentos por subir"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {pendientes.map((d) => (
              <li key={d.clientKey} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-strong">{d.title}</span>
                  <span className={"block text-[11px] " + (d.error ? "text-bad" : "text-muted")}>
                    {d.error
                      ? "No se pudo subir: " + d.error
                      : (!enLinea ? "Esperando señal" : "Subiendo…") + " · " + d.pages + (d.pages === 1 ? " página" : " páginas")}
                  </span>
                </span>
                {d.error && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => descartar(d.clientKey)}>
                    Descartar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mensaje && <Alert kind={mensaje.kind}>{mensaje.text}</Alert>}

      <Field label="Nombre del documento">
        <input className="input" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-primary" onClick={() => camara.current?.click()} disabled={paginas.length >= MAX_PAGINAS}>
          <Icon name="scan" className="h-4 w-4" />
          Tomar foto
        </button>
        <button type="button" className="btn-ghost" onClick={() => galeria.current?.click()} disabled={paginas.length >= MAX_PAGINAS}>
          <Icon name="image" className="h-4 w-4" />
          Subir imágenes
        </button>
        <input
          ref={camara}
          type="file"
          name="escanear-camara"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            void agregar(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={galeria}
          type="file"
          name="escanear-imagenes"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            void agregar(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {paginas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-4 py-10 text-center">
          <Icon name="scan" className="mx-auto h-10 w-10 text-subtle" />
          <p className="mt-3 text-sm font-semibold text-body">Toma una foto de cada página</p>
          <p className="mx-auto mt-1 max-w-xs text-[12px] text-muted">
            Pon la hoja sobre una mesa, con buena luz y sin sombra. Después la giras, la ordenas y la vuelves PDF o texto.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-paginas>
          {paginas.map((p, i) => (
            <li key={p.id} className="overflow-hidden rounded-xl border border-line bg-panel">
              <div className="relative flex aspect-[3/4] items-center justify-center bg-surface">
                {p.lista ? (
                  <img src={p.lista} alt={"Página " + (i + 1)} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[12px] text-muted">Procesando…</span>
                )}
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 text-[11px] font-bold text-white">{i + 1}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1 border-t border-line p-1.5">
                {MODOS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => cambiar(p.id, { modo: m.key })}
                    aria-pressed={p.modo === m.key}
                    title={m.hint}
                    className={
                      "rounded-md px-1.5 py-0.5 text-[11px] font-semibold " +
                      (p.modo === m.key ? "bg-brand-600 text-white" : "text-muted hover:bg-surface")
                    }
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-line px-1 py-1">
                <button type="button" className="rounded-md p-1.5 text-muted hover:bg-surface" onClick={() => mover(i, -1)} aria-label={"Subir página " + (i + 1)} disabled={i === 0}>
                  ‹
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] font-semibold text-muted hover:bg-surface"
                  onClick={() => cambiar(p.id, { rotacion: (((p.rotacion + 90) % 360) as Pagina["rotacion"]) })}
                  aria-label={"Girar página " + (i + 1)}
                >
                  ↻ Girar
                </button>
                <button type="button" className="rounded-md p-1.5 text-muted hover:bg-surface" onClick={() => mover(i, 1)} aria-label={"Bajar página " + (i + 1)} disabled={i === paginas.length - 1}>
                  ›
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-bad"
                  onClick={() => {
                    setPdf(null);
                    setPaginas((todas) => todas.filter((x) => x.id !== p.id));
                  }}
                  aria-label={"Quitar página " + (i + 1)}
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {paginas.length > 0 && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="btn-primary"
              disabled={!listas || ocupado !== null}
              onClick={async () => {
                const archivo = pdf ?? (await crearPdf());
                if (archivo) descargar(archivo, archivo.name);
              }}
            >
              <Icon name="download" className="h-4 w-4" />
              {ocupado === "Armando el PDF…" ? "Armando el PDF…" : "Descargar PDF"}
            </button>
            <button type="button" className="btn-ghost" disabled={!listas || ocupado !== null} onClick={compartir}>
              <Icon name="whatsapp" className="h-4 w-4" />
              Compartir PDF
            </button>
            <button type="button" className="btn-ghost" disabled={!listas || progreso !== null} onClick={pasarATexto}>
              <Icon name="file" className="h-4 w-4" />
              {progreso !== null ? "Leyendo el texto… " + progreso + "%" : "Pasar a texto"}
            </button>
            <button type="button" className="btn-ghost" disabled={!listas || ocupado !== null} onClick={guardar}>
              <Icon name="check" className="h-4 w-4" />
              {ocupado === "Guardando…" ? "Guardando…" : "Guardar en mis documentos"}
            </button>
          </div>
          {progreso !== null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
              <div className="h-full rounded-full bg-brand-600 transition-all duration-300" style={{ width: progreso + "%" }} />
            </div>
          )}
        </>
      )}

      {texto && (
        <div>
          <Field label="Texto del documento" hint="Revísalo: la lectura automática puede equivocarse en letras sueltas.">
            <textarea className="input min-h-48 font-mono text-[13px]" value={texto} onChange={(e) => setTexto(e.target.value)} data-texto-escaneado />
          </Field>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(texto);
                  setMensaje({ kind: "ok", text: "Texto copiado." });
                } catch {
                  setMensaje({ kind: "error", text: "No se pudo copiar. Selecciónalo y cópialo a mano." });
                }
              }}
            >
              Copiar texto
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => descargar(new Blob([texto], { type: "text/plain;charset=utf-8" }), nombreDocumento(titulo, "txt"))}
            >
              <Icon name="download" className="h-4 w-4" />
              Descargar .txt
            </button>
          </div>
        </div>
      )}

      {paginas.length > 0 && (
        <button type="button" className="text-[12px] font-semibold text-muted underline" onClick={empezarOtro}>
          Empezar otro documento
        </button>
      )}
      {ocupado && ocupado !== "Armando el PDF…" && ocupado !== "Guardando…" && (
        <p className="text-center text-[12px] text-muted">{ocupado}</p>
      )}
    </div>
  );
}
