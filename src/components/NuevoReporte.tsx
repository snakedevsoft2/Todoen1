"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  borrarReporte,
  guardarReporte,
  nuevaLlave,
  reportesPendientes,
  subirReportes,
  type ReportePendiente,
} from "@/lib/cola-reportes";
import { fileToDataUrl } from "@/lib/image";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";
import { RegistrarSW } from "./RegistrarSW";

const MAX_FOTOS = 12;
const MAX_PDF = 5;
const MAX_BYTES_PDF = 3 * 1024 * 1024;

type Foto = { data: string; leyenda: string };
type Pdf = { name: string; data: string; size: number };

function leerComoDataUrl(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(archivo);
  });
}

function peso(bytes: number): string {
  return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / 1024 / 1024).toFixed(1) + " MB";
}

/**
 * Hacer un reporte con fotos y evidencias en PDF, con senal o sin ella.
 *
 * Todo se arma en el telefono: el texto, las fotos (ya achicadas) con su
 * descripcion y los PDF. Al tocar enviar se guarda primero en el telefono y
 * despues se sube. Si no hay senal queda en "Esperando señal" y se sube solo
 * cuando vuelve; la persona puede cerrar la pantalla y seguir trabajando.
 */
export function NuevoReporte({
  hoy,
  sitios,
  esAdministrador,
}: {
  hoy: string;
  sitios: { id: string; name: string }[];
  esAdministrador: boolean;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [pendientes, setPendientes] = useState<ReportePendiente[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  const [mensaje, setMensaje] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);

  const refrescar = useCallback(async () => {
    try {
      setPendientes(await reportesPendientes());
    } catch {
      // Sin IndexedDB no hay cola; el aviso sale al intentar guardar.
    }
  }, []);

  const subir = useCallback(async () => {
    try {
      const r = await subirReportes(() => void refrescar());
      await refrescar();
      if (r.enviados > 0) {
        setMensaje({
          kind: "ok",
          text: esAdministrador
            ? r.enviados === 1
              ? "Reporte guardado."
              : r.enviados + " reportes guardados."
            : r.enviados === 1
              ? "Reporte enviado al administrador."
              : r.enviados + " reportes enviados al administrador.",
        });
        if (navigator.onLine) router.refresh();
      } else if (r.aviso) {
        setMensaje({ kind: "error", text: r.aviso });
      }
    } catch {
      // Se reintenta en el proximo evento.
    }
  }, [esAdministrador, refrescar, router]);

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
    // Por si el evento "online" no llega (pasa en celulares): cada 30 segundos
    // se vuelve a intentar mientras quede algo en la cola.
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

  async function agregarFotos(lista: FileList | null) {
    if (!lista?.length) return;
    setProcesando(true);
    const nuevas: Foto[] = [];
    for (const archivo of Array.from(lista).slice(0, MAX_FOTOS - fotos.length)) {
      try {
        nuevas.push({ data: await fileToDataUrl(archivo, { maxSide: 1600, maxBytes: 450 * 1024 }), leyenda: "" });
      } catch {
        setMensaje({ kind: "error", text: "Una de las fotos no se pudo leer." });
      }
    }
    setFotos((f) => [...f, ...nuevas].slice(0, MAX_FOTOS));
    setProcesando(false);
  }

  async function agregarPdfs(lista: FileList | null) {
    if (!lista?.length) return;
    setProcesando(true);
    const nuevos: Pdf[] = [];
    for (const archivo of Array.from(lista).slice(0, MAX_PDF - pdfs.length)) {
      if (archivo.type !== "application/pdf" && !/\.pdf$/i.test(archivo.name)) {
        setMensaje({ kind: "error", text: archivo.name + " no es un PDF." });
        continue;
      }
      if (archivo.size > MAX_BYTES_PDF) {
        setMensaje({ kind: "error", text: archivo.name + " pesa más de 3 MB. Comprímelo o divídelo." });
        continue;
      }
      try {
        const data = (await leerComoDataUrl(archivo)).replace(/^data:[^;]*;/, "data:application/pdf;");
        nuevos.push({ name: archivo.name.slice(0, 120), data, size: archivo.size });
      } catch {
        setMensaje({ kind: "error", text: "No se pudo leer " + archivo.name + "." });
      }
    }
    setPdfs((p) => [...p, ...nuevos].slice(0, MAX_PDF));
    setProcesando(false);
  }

  async function guardarYEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    if (!title) {
      setMensaje({ kind: "error", text: "Escribe un título para el reporte." });
      return;
    }
    const siteId = String(fd.get("siteId") ?? "") || null;
    const reporte: ReportePendiente = {
      clientKey: nuevaLlave(),
      title: title.slice(0, 200),
      body: String(fd.get("body") ?? "").slice(0, 4000),
      observaciones: String(fd.get("observations") ?? "").slice(0, 4000),
      day: String(fd.get("day") ?? "") || hoy,
      siteId,
      siteName: sitios.find((s) => s.id === siteId)?.name ?? null,
      clientName: String(fd.get("clientName") ?? "").slice(0, 200),
      clientPhone: String(fd.get("clientPhone") ?? "").slice(0, 40),
      fotos: fotos.map((f) => f.data),
      leyendas: fotos.map((f) => f.leyenda.trim().slice(0, 120)),
      adjuntos: pdfs.map(({ name, data }) => ({ name, data })),
      adjuntosSubidos: 0,
      creadoEn: new Date().toISOString(),
      reportId: null,
      fotosSubidas: 0,
      error: null,
    };

    try {
      await guardarReporte(reporte);
    } catch {
      setMensaje({ kind: "error", text: "Este navegador no deja guardar el reporte. Prueba con Chrome o Safari normal." });
      return;
    }

    form.current?.reset();
    setFotos([]);
    setPdfs([]);
    await refrescar();
    if (navigator.onLine) {
      setMensaje({ kind: "info", text: "Enviando el reporte…" });
      void subir();
    } else {
      setMensaje({ kind: "info", text: "Sin señal: el reporte quedó guardado en tu teléfono y se envía solo cuando vuelva." });
    }
  }

  async function descartar(clientKey: string) {
    await borrarReporte(clientKey);
    await refrescar();
  }

  return (
    <div className="space-y-4">
      <RegistrarSW guardarEstaPagina />

      {pendientes.length > 0 && (
        <div data-reportes-pendientes className="rounded-xl border border-warn-line bg-warn-soft p-3">
          <p className="flex items-center gap-2 text-[13px] font-bold text-warn">
            <Icon name="clock" className="h-4 w-4" />
            {pendientes.length === 1 ? "1 reporte por enviar" : pendientes.length + " reportes por enviar"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {pendientes.map((p) => (
              <li key={p.clientKey} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-strong">{p.title}</span>
                  <span className={"block text-[11px] " + (p.error ? "text-bad" : "text-muted")}>
                    {p.error
                      ? "No se pudo enviar: " + p.error
                      : !enLinea
                        ? "Esperando señal · " + p.fotos.length + (p.fotos.length === 1 ? " foto" : " fotos") + ((p.adjuntos?.length ?? 0) > 0 ? " · " + p.adjuntos!.length + " PDF" : "")
                        : p.reportId
                          ? p.fotosSubidas < p.fotos.length
                            ? "Subiendo fotos " + p.fotosSubidas + " de " + p.fotos.length
                            : "Subiendo PDF " + (p.adjuntosSubidos ?? 0) + " de " + (p.adjuntos?.length ?? 0)
                          : "Enviando…"}
                  </span>
                </span>
                {p.error && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => descartar(p.clientKey)}>
                    Descartar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form ref={form} onSubmit={guardarYEnviar} className="space-y-3">
        {mensaje && <Alert kind={mensaje.kind}>{mensaje.text}</Alert>}

        <Field label="Título">
          <input className="input" name="title" required maxLength={200} placeholder="Ej: Limpieza de fachada" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha">
            <input className="input" type="date" name="day" defaultValue={hoy} />
          </Field>
          <Field label="Sitio">
            <select className="input" name="siteId" defaultValue={sitios[0]?.id ?? ""}>
              <option value="">Sin sitio</option>
              {sitios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Qué se hizo">
          <textarea
            className="input min-h-28"
            name="body"
            maxLength={4000}
            placeholder="Ej: Se limpió la fachada norte y se cambiaron dos luminarias del parqueadero."
          />
        </Field>

        <div>
          <span className="label">Fotos ({fotos.length} de {MAX_FOTOS})</span>
          {fotos.length > 0 && (
            <ul className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {fotos.map((f, i) => (
                <li key={i} className="overflow-hidden rounded-xl border border-line bg-panel">
                  <div className="relative">
                    <img src={f.data} alt={"Foto " + (i + 1)} className="aspect-[4/3] w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFotos((l) => l.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                      aria-label={"Quitar foto " + (i + 1)}
                    >
                      <Icon name="x" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    className="w-full border-t border-line bg-transparent px-2 py-1.5 text-[12px] text-body outline-none placeholder:text-subtle"
                    value={f.leyenda}
                    maxLength={120}
                    onChange={(e) => setFotos((l) => l.map((x, j) => (j === i ? { ...x, leyenda: e.target.value } : x)))}
                    placeholder="Descripción (opcional)"
                    aria-label={"Descripción de la foto " + (i + 1)}
                  />
                </li>
              ))}
            </ul>
          )}
          {fotos.length < MAX_FOTOS && (
            <label
              className={
                "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-5 text-sm font-semibold text-body transition-colors hover:bg-surface " +
                (procesando ? "pointer-events-none opacity-60" : "")
              }
            >
              <Icon name="image" className="h-5 w-5 text-muted" />
              {procesando ? "Preparando…" : fotos.length === 0 ? "Tomar o agregar fotos" : "Agregar más fotos"}
              <input
                type="file"
                name="fotos-reporte"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void agregarFotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>

        <Field label="Observaciones y recomendaciones (opcional)">
          <textarea
            className="input min-h-20"
            name="observations"
            maxLength={4000}
            placeholder="Ej: Se recomienda revisar la bajante del piso 3 antes de la temporada de lluvias."
          />
        </Field>

        <div>
          <span className="label">Evidencias en PDF ({pdfs.length} de {MAX_PDF})</span>
          {pdfs.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {pdfs.map((p, i) => (
                <li key={i} className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-[13px]">
                  <Icon name="file" className="h-4 w-4 shrink-0 text-bad" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-strong">{p.name}</span>
                  <span className="shrink-0 text-[11px] text-muted">{peso(p.size)}</span>
                  <button
                    type="button"
                    onClick={() => setPdfs((l) => l.filter((_, j) => j !== i))}
                    className="rounded-full p-1 text-muted hover:bg-surface hover:text-bad"
                    aria-label={"Quitar " + p.name}
                  >
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pdfs.length < MAX_PDF && (
            <label
              className={
                "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-4 text-sm font-semibold text-body transition-colors hover:bg-surface " +
                (procesando ? "pointer-events-none opacity-60" : "")
              }
            >
              <Icon name="file" className="h-5 w-5 text-muted" />
              Adjuntar PDF (actas, facturas, documentos)
              <input
                type="file"
                name="evidencias-pdf"
                accept="application/pdf,.pdf"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void agregarPdfs(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <p className="mt-1 text-[11px] text-subtle">Hasta 3 MB cada uno. Al exportar el reporte van al final del PDF.</p>
        </div>

        <details className="rounded-xl border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-body">Datos del cliente (opcional)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Cliente">
              <input className="input" name="clientName" maxLength={200} placeholder="Ej: Edificio Los Cedros" />
            </Field>
            <Field label="WhatsApp del cliente" hint="Para mandarle el PDF.">
              <input className="input" name="clientPhone" inputMode="tel" maxLength={40} placeholder="300 000 0000" />
            </Field>
          </div>
        </details>

        <button type="submit" disabled={procesando} className="btn-primary w-full">
          <Icon name={esAdministrador ? "check" : "arrowOut"} className="h-4 w-4" />
          {esAdministrador ? "Guardar reporte" : "Enviar al administrador"}
        </button>
        {!enLinea && (
          <p className="text-center text-[12px] text-warn">Sin señal: se guarda en tu teléfono y se envía solo.</p>
        )}
      </form>
    </div>
  );
}
