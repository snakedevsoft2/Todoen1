"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACEPTA_FIRMA, agregarEscaneado, subirArchivoFirma } from "@/lib/firma-subir";
import { Icon } from "../Icon";

/**
 * Crear una solicitud de firma: a quien, que documentos y un mensaje. Al
 * terminar lleva a la solicitud, donde se marca donde firmar y se manda el
 * enlace.
 */
export function NuevaSolicitudFirma({
  escaneados,
  maximo,
}: {
  escaneados: { id: string; title: string; pages: number }[];
  maximo: number;
}) {
  const router = useRouter();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [estado, setEstado] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [creada, setCreada] = useState<string | null>(null);

  const total = archivos.length + elegidos.length;

  async function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErrores([]);
    if (total === 0) return setErrores(["Agrega al menos un documento para firmar."]);
    if (total > maximo) return setErrores(["Una solicitud lleva máximo " + maximo + " documentos."]);

    setEstado("Creando la solicitud…");
    let id: string;
    try {
      const r = await fetch("/api/firmas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(f.entries())),
      });
      const datos = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!r.ok || !datos.id) {
        setEstado(null);
        return setErrores([datos.error ?? "No se pudo crear la solicitud."]);
      }
      id = datos.id;
    } catch {
      setEstado(null);
      return setErrores(["Sin conexión. Intenta otra vez con señal."]);
    }

    const fallas: string[] = [];
    let n = 0;
    for (const a of archivos) {
      setEstado("Subiendo " + ++n + " de " + total + "…");
      const err = await subirArchivoFirma(id, a);
      if (err) fallas.push(err);
    }
    for (const scanId of elegidos) {
      setEstado("Subiendo " + ++n + " de " + total + "…");
      const err = await agregarEscaneado(id, scanId, escaneados.find((s) => s.id === scanId)?.title ?? "Documento");
      if (err) fallas.push(err);
    }
    setEstado(null);
    if (fallas.length) {
      setErrores(fallas);
      setCreada(id);
      return;
    }
    router.push("/panel/firmas/" + id);
  }

  return (
    <form onSubmit={crear} className="space-y-3" data-nueva-firma>
      <label className="block">
        <span className="label">¿Qué van a firmar?</span>
        <input name="title" className="input" maxLength={160} placeholder="Acta de entrega, contrato, paz y salvo…" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="label">Nombre de quien firma</span>
          <input name="signerName" className="input" maxLength={120} required autoComplete="off" />
        </label>
        <label className="block">
          <span className="label">WhatsApp (opcional)</span>
          <input name="signerPhone" className="input" maxLength={30} inputMode="tel" placeholder="300 123 4567" />
        </label>
        <label className="block">
          <span className="label">Correo (opcional)</span>
          <input name="signerEmail" type="email" className="input" maxLength={160} />
        </label>
      </div>
      <label className="block">
        <span className="label">Mensaje para el cliente (opcional)</span>
        <textarea name="message" className="input min-h-20" maxLength={1000} placeholder="Firma en la última página, por favor." />
      </label>

      <div>
        <span className="label">Documentos ({total} de máximo {maximo})</span>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-surface px-3 py-4 text-sm font-semibold text-brand-700">
          <Icon name="upload" className="h-5 w-5" /> Adjuntar PDF o fotos
          <input
            type="file"
            accept={ACEPTA_FIRMA}
            multiple
            className="sr-only"
            onChange={(e) => {
              const nuevos = Array.from(e.target.files ?? []);
              setArchivos((a) => [...a, ...nuevos].slice(0, maximo));
              e.target.value = "";
            }}
          />
        </label>
        {archivos.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {archivos.map((a, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px]">
                <Icon name="file" className="h-4 w-4 shrink-0 text-bad" />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <button
                  type="button"
                  className="text-subtle hover:text-bad"
                  aria-label={"Quitar " + a.name}
                  onClick={() => setArchivos((l) => l.filter((_, k) => k !== i))}
                >
                  <Icon name="x" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {escaneados.length > 0 && (
        <details className="rounded-xl border border-line bg-surface px-3 py-2">
          <summary className="cursor-pointer text-[13px] font-semibold text-brand-700">Usar un documento del Escáner</summary>
          <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
            {escaneados.map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={elegidos.includes(s.id)}
                    onChange={(e) => setElegidos((l) => (e.target.checked ? [...l, s.id] : l.filter((x) => x !== s.id)))}
                  />
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="text-subtle">{s.pages} pág.</span>
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}

      {errores.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-bad-line bg-bad-soft p-3 text-[13px] text-bad">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {creada ? (
        <button type="button" onClick={() => router.push("/panel/firmas/" + creada)} className="btn-primary w-full">
          Ir a la solicitud
        </button>
      ) : (
        <button type="submit" disabled={Boolean(estado)} className="btn-primary w-full">
          <Icon name="pencil" className="h-4 w-4" /> {estado ?? "Crear y seguir"}
        </button>
      )}
    </form>
  );
}
