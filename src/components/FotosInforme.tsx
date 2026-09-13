"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { agregarFotoAction, borrarFotoAction } from "@/actions/informes";
import { fileToDataUrl } from "@/lib/image";
import { SubmitButton } from "./SubmitButton";
import { Icon } from "./Icon";

/**
 * Las fotos de un reporte.
 *
 * Se achican en el telefono antes de subir (una foto de celular pesa varios
 * megas) y se suben de a una: con mala senal, la que alcanzo a subir queda
 * guardada y solo hay que reintentar las que faltaron.
 */
export function FotosInforme({
  reportId,
  fotos,
  puedeBorrar,
}: {
  reportId: string;
  fotos: { id: string; caption: string | null }[];
  puedeBorrar: boolean;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subir(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setError(null);
    const archivos = Array.from(lista);
    let fallidas = 0;

    for (let i = 0; i < archivos.length; i += 1) {
      setProgreso("Subiendo " + (i + 1) + " de " + archivos.length + "...");
      try {
        const image = await fileToDataUrl(archivos[i], { maxSide: 1600, maxBytes: 450 * 1024 });
        const fd = new FormData();
        fd.set("reportId", reportId);
        fd.set("image", image);
        const r = await agregarFotoAction(undefined, fd);
        if (r?.error) {
          setError(r.error);
          fallidas += 1;
          if (/maximo/.test(r.error)) break;
        }
      } catch (e) {
        fallidas += 1;
        setError(e instanceof Error ? e.message : "No se pudo subir una foto.");
      }
    }

    setProgreso(null);
    if (entrada.current) entrada.current.value = "";
    if (fallidas > 0 && fallidas < archivos.length) {
      setError("Subieron " + (archivos.length - fallidas) + " de " + archivos.length + ". Reintenta las que faltaron.");
    }
    router.refresh();
  }

  return (
    <div>
      {fotos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fotos.map((f) => (
            <li key={f.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              <img
                src={"/foto-reporte/" + f.id}
                alt={f.caption ?? "Foto del reporte"}
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
              {puedeBorrar && (
                <form action={borrarFotoAction} className="p-2">
                  <input type="hidden" name="id" value={f.id} />
                  <SubmitButton className="btn-ghost btn-sm w-full" pendingText="...">
                    <Icon name="trash" className="h-3.5 w-3.5" />
                    Quitar
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <label
        className={
          "mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-5 text-sm font-semibold text-body transition-colors hover:bg-surface " +
          (progreso ? "pointer-events-none opacity-60" : "")
        }
      >
        <Icon name="image" className="h-5 w-5 text-muted" />
        {progreso ?? (fotos.length === 0 ? "Agregar fotos" : "Agregar mas fotos")}
        <input
          ref={entrada}
          id="fotos-informe"
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => subir(e.target.files)}
        />
      </label>

      {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
    </div>
  );
}
