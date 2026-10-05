"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACEPTA_FIRMA, subirArchivoFirma } from "@/lib/firma-subir";
import { Icon } from "../Icon";

/** Sumarle documentos a una solicitud que todavia no han firmado. */
export function AgregarDocumentosFirma({ requestId, faltan }: { requestId: string; faltan: number }) {
  const router = useRouter();
  const [estado, setEstado] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  if (faltan <= 0) return null;

  return (
    <div>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-surface px-3 py-3 text-sm font-semibold text-brand-700">
        <Icon name="upload" className="h-5 w-5" /> {estado ?? "Agregar PDF o fotos"}
        <input
          type="file"
          accept={ACEPTA_FIRMA}
          multiple
          disabled={Boolean(estado)}
          className="sr-only"
          onChange={async (e) => {
            const lista = Array.from(e.target.files ?? []).slice(0, faltan);
            e.target.value = "";
            const fallas: string[] = [];
            for (let i = 0; i < lista.length; i++) {
              setEstado("Subiendo " + (i + 1) + " de " + lista.length + "…");
              const err = await subirArchivoFirma(requestId, lista[i]);
              if (err) fallas.push(err);
            }
            setEstado(null);
            setErrores(fallas);
            router.refresh();
          }}
        />
      </label>
      {errores.length > 0 && (
        <ul className="mt-2 space-y-1 text-[13px] font-semibold text-bad">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
