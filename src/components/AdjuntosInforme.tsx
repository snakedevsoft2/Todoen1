"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { borrarAdjuntoAction } from "@/actions/informes";
import { SubmitButton } from "./SubmitButton";
import { Icon } from "./Icon";

const MAX_BYTES_PDF = 3 * 1024 * 1024;

function peso(bytes: number): string {
  return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function leer(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]*;/, "data:application/pdf;"));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(archivo);
  });
}

/**
 * Las evidencias en PDF de un reporte ya enviado: verlas, agregar mas o
 * quitarlas. Al exportar el reporte, sus paginas van al final.
 */
export function AdjuntosInforme({
  reportId,
  adjuntos,
  puedeEditar,
  maximo,
}: {
  reportId: string;
  adjuntos: { id: string; name: string; size: number }[];
  puedeEditar: boolean;
  maximo: number;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subir(lista: FileList | null) {
    if (!lista?.length) return;
    setError(null);
    for (const archivo of Array.from(lista).slice(0, maximo - adjuntos.length)) {
      if (archivo.size > MAX_BYTES_PDF) {
        setError(archivo.name + " pesa más de 3 MB.");
        continue;
      }
      setSubiendo(archivo.name);
      try {
        const r = await fetch("/api/informes/" + reportId + "/adjuntos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: archivo.name, data: await leer(archivo) }),
        });
        if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo subir " + archivo.name + ".");
      } catch {
        setError("Sin conexión. Intenta otra vez con señal.");
      }
    }
    setSubiendo(null);
    if (entrada.current) entrada.current.value = "";
    router.refresh();
  }

  return (
    <div>
      {adjuntos.length === 0 ? (
        <p className="text-[13px] text-muted">Este reporte no tiene PDF de evidencia.</p>
      ) : (
        <ul className="space-y-1.5" data-adjuntos>
          {adjuntos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px]">
              <Icon name="file" className="h-4 w-4 shrink-0 text-bad" />
              <a
                href={"/adjunto-reporte/" + a.id}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate font-semibold text-strong hover:underline"
              >
                {a.name}
              </a>
              <span className="shrink-0 text-[11px] text-muted">{peso(a.size)}</span>
              {puedeEditar && (
                <form action={borrarAdjuntoAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton
                    className="btn-ghost btn-sm px-2 text-subtle hover:text-bad"
                    pendingText="..."
                    ariaLabel={"Quitar " + a.name}
                    confirm={"¿Quitar " + a.name + " del reporte?"}
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && adjuntos.length < maximo && (
        <label
          className={
            "mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-4 text-sm font-semibold text-body transition-colors hover:bg-surface " +
            (subiendo ? "pointer-events-none opacity-60" : "")
          }
        >
          <Icon name="file" className="h-5 w-5 text-muted" />
          {subiendo ? "Subiendo " + subiendo + "…" : "Adjuntar PDF"}
          <input
            ref={entrada}
            type="file"
            name="adjuntar-pdf"
            accept="application/pdf,.pdf"
            multiple
            className="sr-only"
            onChange={(e) => subir(e.target.files)}
          />
        </label>
      )}
      {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
    </div>
  );
}
