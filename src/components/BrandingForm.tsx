"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { updateBrandingAction } from "@/actions/branding";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";
import { BRAND_PRESETS, isTheme, normalizeHex, themeVars, type ThemeName } from "@/lib/theme";

const MAX_SIDE = 320;
const MAX_BYTES = 150 * 1024;

/** Reduce la imagen en el navegador para no guardar archivos enormes. */
async function fileToLogo(file: File): Promise<string> {
  if (file.type === "image/svg+xml") {
    const text = await file.text();
    if (text.length > MAX_BYTES) throw new Error("El SVG es demasiado grande.");
    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(text)));
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.drawImage(bitmap, 0, 0, width, height);

  for (const quality of [0.92, 0.8, 0.65, 0.5]) {
    const url = canvas.toDataURL("image/png") ;
    const webp = canvas.toDataURL("image/webp", quality);
    const best = webp.length < url.length ? webp : url;
    if (best.length <= MAX_BYTES) return best;
  }
  throw new Error("La imagen pesa demasiado. Prueba con una mas pequena.");
}

export function BrandingForm({
  businessName,
  initial,
}: {
  businessName: string;
  initial: {
    brandColor: string;
    theme: string;
    tagline: string | null;
    logo: string | null;
  };
}) {
  const [state, formAction] = useActionState(updateBrandingAction, undefined);
  const [color, setColor] = useState(normalizeHex(initial.brandColor));
  const [theme, setTheme] = useState<ThemeName>(isTheme(initial.theme) ? initial.theme : "claro");
  const [logo, setLogo] = useState<string | null>(initial.logo);
  const [tagline, setTagline] = useState(initial.tagline ?? "");
  const [logoError, setLogoError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // La vista previa usa exactamente las mismas variables que la aplicacion real.
  const previewStyle = useMemo(() => {
    const vars = themeVars(color, theme);
    return Object.fromEntries(Object.entries(vars)) as React.CSSProperties;
  }, [color, theme]);

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setLogoError("");
    try {
      setLogo(await fileToLogo(file));
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : "No se pudo leer la imagen.");
    }
  }

  const initials = businessName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <form action={formAction} className="card space-y-5">
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

        <input type="hidden" name="brandColor" value={color} />
        <input type="hidden" name="theme" value={theme} />
        <input type="hidden" name="logo" value={logo ?? (initial.logo ? "__borrar__" : "")} />

        <section>
          <h3 className="mb-1 text-sm font-bold text-strong">Color de tu marca</h3>
          <p className="mb-3 text-xs text-muted">
            Este color pinta los botones, los enlaces y los resaltados de toda la aplicacion.
          </p>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-6">
            {BRAND_PRESETS.map((preset) => (
              <button
                key={preset.color}
                type="button"
                title={preset.name}
                aria-label={preset.name}
                onClick={() => setColor(preset.color)}
                className={
                  "flex h-11 items-center justify-center rounded-xl border transition " +
                  (color === preset.color ? "border-strong scale-105" : "border-transparent")
                }
                style={{ backgroundColor: preset.color }}
              >
                {color === preset.color && (
                  <Icon name="check" className="h-4 w-4 text-white drop-shadow" />
                )}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-body">
              <span className="text-xs font-medium text-muted">Color exacto</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(normalizeHex(e.target.value))}
                className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-panel p-1"
              />
            </label>
            <input
              className="input max-w-[140px] font-mono text-sm uppercase"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              onBlur={(e) => setColor(normalizeHex(e.target.value))}
              aria-label="Codigo del color"
            />
          </div>
        </section>

        <section className="divider pt-5">
          <h3 className="mb-1 text-sm font-bold text-strong">Tema</h3>
          <p className="mb-3 text-xs text-muted">Elige como se ve el fondo de la aplicacion.</p>
          <div className="grid grid-cols-2 gap-3">
            {(["claro", "oscuro"] as ThemeName[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTheme(option)}
                className={
                  "rounded-xl border p-3 text-left transition " +
                  (theme === option
                    ? "border-brand-500 ring-2 ring-brand-500/20"
                    : "border-line hover:border-line-strong")
                }
              >
                <span
                  className="mb-2 flex h-12 items-center gap-1.5 rounded-lg px-2"
                  style={{
                    backgroundColor: option === "claro" ? "#f8fafc" : "#0f172a",
                    border: "1px solid " + (option === "claro" ? "#e2e8f0" : "#1e293b"),
                  }}
                >
                  <span className="h-6 w-6 rounded-md" style={{ backgroundColor: color }} />
                  <span className="flex-1 space-y-1">
                    <span
                      className="block h-1.5 w-full rounded-full"
                      style={{ backgroundColor: option === "claro" ? "#cbd5e1" : "#334155" }}
                    />
                    <span
                      className="block h-1.5 w-2/3 rounded-full"
                      style={{ backgroundColor: option === "claro" ? "#e2e8f0" : "#1e293b" }}
                    />
                  </span>
                </span>
                <span className="text-sm font-semibold capitalize text-strong">{option}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="divider pt-5">
          <h3 className="mb-1 text-sm font-bold text-strong">Logo</h3>
          <p className="mb-3 text-xs text-muted">
            Aparece en el menu, en el celular y en tu pagina publica. PNG, JPG, WEBP o SVG.
          </p>

          {logoError && (
            <div className="mb-3">
              <Alert kind="error">{logoError}</Alert>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Logo" className="h-full w-full object-contain p-1.5" />
              ) : (
                <span
                  className="flex h-full w-full items-center justify-center text-xl font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {initials || "N"}
                </span>
              )}
            </span>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" className="h-4 w-4" />
                {logo ? "Cambiar logo" : "Subir logo"}
              </button>
              {logo && (
                <button
                  type="button"
                  className="btn-ghost btn-sm text-bad"
                  onClick={() => {
                    setLogo(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  <Icon name="trash" className="h-4 w-4" />
                  Quitar
                </button>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
          </div>
          <p className="mt-2 text-xs text-subtle">
            La imagen se achica sola. Si no subes ninguna usamos las iniciales de tu negocio.
          </p>
        </section>

        <section className="divider pt-5">
          <Field label="Frase de tu pagina publica" hint="Opcional. Sale debajo del nombre del negocio.">
            <input
              className="input"
              name="tagline"
              value={tagline}
              maxLength={120}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Ej: Cortes clasicos y barberia moderna"
            />
          </Field>
        </section>

        <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
          Guardar personalizacion
        </SubmitButton>
      </form>

      {/* Vista previa en vivo */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          Vista previa
        </p>
        <div
          style={previewStyle}
          className="overflow-hidden rounded-2xl border border-line bg-ink shadow-soft"
        >
          <div className="flex items-center gap-2.5 border-b border-line bg-panel px-3 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-brand-600 text-xs font-bold text-on-brand">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-full w-full bg-panel object-contain p-1" />
              ) : (
                initials || "N"
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-strong">{businessName}</span>
              <span className="block text-[10px] font-medium uppercase tracking-wider text-brand-600">
                Panel del negocio
              </span>
            </span>
          </div>

          <div className="space-y-3 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-line bg-panel p-2.5">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Ventas
                </span>
                <span className="block text-lg font-bold text-brand-600">$ 320.000</span>
              </div>
              <div className="rounded-xl border border-line bg-panel p-2.5">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Te queda
                </span>
                <span className="block text-lg font-bold text-good">$ 268.000</span>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-panel p-3">
              <span className="mb-2 block text-xs font-semibold text-strong">Turno de las 3:00 pm</span>
              <span className="mb-2 block text-xs text-muted">Corte degradado, 40 minutos</span>
              <span className="flex gap-2">
                <span className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-on-brand">
                  Cerrar venta
                </span>
                <span className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[11px] font-semibold text-body">
                  Cancelar
                </span>
              </span>
            </div>

            <div className="rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-[11px] text-warn">
              Aviso de ejemplo
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-subtle">
          Los cambios se ven aqui al instante. Se aplican a toda la aplicacion cuando guardas.
        </p>
      </div>
    </div>
  );
}
