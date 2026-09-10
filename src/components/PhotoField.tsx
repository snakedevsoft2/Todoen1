"use client";

import { useRef, useState } from "react";
import { fileToDataUrl } from "@/lib/image";
import { Icon } from "./Icon";

/**
 * Selector de foto con vista previa.
 *
 * Manda la imagen en un campo oculto como data URL. Si la prenda ya tenia foto
 * y la quitas, manda "__borrar__" para que el servidor la borre de verdad.
 */
export function PhotoField({
  name = "image",
  currentUrl,
  label = "Foto de la prenda",
  hint = "Se ve en el catalogo, en el inventario y al vender.",
  onChange,
}: {
  name?: string;
  /** Direccion de la foto que ya esta guardada, si hay. */
  currentUrl?: string | null;
  /** Avisa la foto elegida (o null si la quitaron), para la vista previa. */
  onChange?: (value: string | null) => void;
  label?: string;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = preview ?? (removed ? null : (currentUrl ?? null));

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setPreview(dataUrl);
      setRemoved(false);
      onChange?.(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la imagen.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setPreview(null);
    setRemoved(true);
    setError("");
    onChange?.(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // Vacio = no toques la foto guardada.
  const value = preview ?? (removed ? "__borrar__" : "");

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <span className="label">{label}</span>

      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-panel">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="Vista previa" className="h-full w-full object-cover" />
          ) : (
            <Icon name="shirt" className="h-7 w-7 text-subtle" />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Icon name="upload" className="h-4 w-4" />
            {busy ? "Procesando..." : shown ? "Cambiar foto" : "Subir foto"}
          </button>
          {shown && (
            <button type="button" className="btn-ghost btn-sm text-bad" onClick={clear}>
              Quitar
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </div>

      {error ? (
        <p className="mt-1 text-xs text-bad">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-subtle">{hint} La foto se achica sola.</p>
      )}
    </div>
  );
}
