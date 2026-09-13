"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  borrarNovedad,
  guardarNovedad,
  novedadesPendientes,
  nuevaLlave,
  subirNovedades,
  type NovedadPendiente,
} from "@/lib/cola-reportes";
import { TIPOS_NOVEDAD, etiquetaNovedad, validarNovedad, type TipoNovedad } from "@/lib/novedades";
import { fileToDataUrl } from "@/lib/image";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";
import { RegistrarSW } from "./RegistrarSW";

/**
 * Avisar una novedad al administrador, con senal o sin ella.
 *
 * Igual que el reporte: se guarda en el telefono y se envia sola cuando hay
 * senal. Quien avisa desde el bus que va a llegar tarde no puede depender de
 * tener datos en ese momento.
 */
export function NovedadForm({ hoy }: { hoy: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<TipoNovedad>("PERMISO");
  const [foto, setFoto] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<NovedadPendiente[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  const [mensaje, setMensaje] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);

  const tipo = TIPOS_NOVEDAD.find((t) => t.key === kind) ?? TIPOS_NOVEDAD[0];

  const refrescar = useCallback(async () => {
    try {
      setPendientes(await novedadesPendientes());
    } catch {
      // Sin IndexedDB no hay cola.
    }
  }, []);

  const subir = useCallback(async () => {
    try {
      const r = await subirNovedades(() => void refrescar());
      await refrescar();
      if (r.enviados > 0) {
        setMensaje({ kind: "ok", text: "Novedad enviada al administrador." });
        if (navigator.onLine) router.refresh();
      } else if (r.aviso) {
        setMensaje({ kind: "error", text: r.aviso });
      }
    } catch {
      // Se reintenta en el proximo evento.
    }
  }, [refrescar, router]);

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

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const datos = {
      kind,
      fromDay: String(fd.get("fromDay") ?? ""),
      toDay: String(fd.get("toDay") ?? ""),
      fromTime: tipo.porHoras ? String(fd.get("fromTime") ?? "") : "",
      toTime: tipo.porHoras ? String(fd.get("toTime") ?? "") : "",
      reason: String(fd.get("reason") ?? ""),
    };
    // Las mismas reglas del servidor, para avisar el error antes de guardar.
    const v = validarNovedad(datos, hoy);
    if (!v.ok) {
      setMensaje({ kind: "error", text: v.error });
      return;
    }

    try {
      await guardarNovedad({ ...v.datos, clientKey: nuevaLlave(), photo: foto, creadoEn: new Date().toISOString(), error: null });
    } catch {
      setMensaje({ kind: "error", text: "Este navegador no deja guardar la novedad. Prueba con Chrome o Safari normal." });
      return;
    }

    form.current?.reset();
    setFoto(null);
    await refrescar();
    if (navigator.onLine) {
      setMensaje({ kind: "info", text: "Enviando la novedad…" });
      void subir();
    } else {
      setMensaje({ kind: "info", text: "Sin señal: la novedad quedó guardada en tu teléfono y se envía sola cuando vuelva." });
    }
  }

  return (
    <div className="space-y-4">
      <RegistrarSW guardarEstaPagina />

      {pendientes.length > 0 && (
        <div data-novedades-pendientes className="rounded-xl border border-warn-line bg-warn-soft p-3">
          <p className="flex items-center gap-2 text-[13px] font-bold text-warn">
            <Icon name="clock" className="h-4 w-4" />
            {pendientes.length === 1 ? "1 novedad por enviar" : pendientes.length + " novedades por enviar"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {pendientes.map((p) => (
              <li key={p.clientKey} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-strong">{etiquetaNovedad(p.kind)}</span>
                  <span className={"block text-[11px] " + (p.error ? "text-bad" : "text-muted")}>
                    {p.error ? "No se pudo enviar: " + p.error : enLinea ? "Enviando…" : "Esperando señal"}
                  </span>
                </span>
                {p.error && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={async () => {
                      await borrarNovedad(p.clientKey);
                      await refrescar();
                    }}
                  >
                    Descartar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form ref={form} onSubmit={enviar} className="space-y-4">
        {mensaje && <Alert kind={mensaje.kind}>{mensaje.text}</Alert>}

        <div>
          <span className="label">¿Qué pasa?</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de novedad">
            {TIPOS_NOVEDAD.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={kind === t.key}
                onClick={() => setKind(t.key)}
                className={
                  "rounded-xl border px-2 py-2.5 text-[13px] font-semibold leading-tight transition-all duration-150 active:scale-95 " +
                  (kind === t.key
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-line-strong bg-panel text-body hover:border-brand-400")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">{tipo.hint}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde el día">
            <input className="input" type="date" name="fromDay" required defaultValue={hoy} />
          </Field>
          <Field label="Hasta el día" hint="Si es un solo día, déjalo igual.">
            <input className="input" type="date" name="toDay" defaultValue={hoy} />
          </Field>
          {tipo.porHoras && (
            <>
              <Field label="Desde la hora">
                <input className="input" type="time" name="fromTime" />
              </Field>
              <Field label="Hasta la hora">
                <input className="input" type="time" name="toTime" />
              </Field>
            </>
          )}
        </div>

        <Field label="Motivo">
          <textarea
            className="input min-h-24"
            name="reason"
            required
            maxLength={1000}
            placeholder="Ej: Tengo cita médica a las 10. Llego a trabajar a la 1 de la tarde."
          />
        </Field>

        <div>
          <span className="label">Soporte (opcional)</span>
          {foto ? (
            <div className="flex items-center gap-3">
              <img src={foto} alt="Soporte" className="h-20 w-20 rounded-xl border border-line object-cover" />
              <button type="button" className="btn-ghost btn-sm text-bad" onClick={() => setFoto(null)}>
                Quitar
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-4 text-sm font-semibold text-body transition-colors hover:bg-surface">
              <Icon name="image" className="h-5 w-5 text-muted" />
              Foto de la incapacidad, la cita o el documento
              <input
                type="file"
                name="soporte"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const archivo = e.target.files?.[0];
                  e.target.value = "";
                  if (!archivo) return;
                  try {
                    setFoto(await fileToDataUrl(archivo, { maxSide: 1600, maxBytes: 450 * 1024 }));
                  } catch {
                    setMensaje({ kind: "error", text: "No se pudo leer la foto." });
                  }
                }}
              />
            </label>
          )}
        </div>

        <button type="submit" className="btn-primary w-full">
          <Icon name="bell" className="h-4 w-4" />
          Avisar al administrador
        </button>
        {!enLinea && <p className="text-center text-[12px] text-warn">Sin señal: se guarda en tu teléfono y se envía sola.</p>}
      </form>
    </div>
  );
}
