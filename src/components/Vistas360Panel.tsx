"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ANGULOS = [90, 180, 270];

/**
 * Genera con IA las vistas 360 de un producto, a partir de su foto.
 *
 * Pide una vista por llamada, una tras otra: cada una tarda unos segundos y
 * asi ninguna peticion se pasa del tiempo del servidor. Si una falla, las que
 * ya salieron se quedan.
 */
export function Vistas360Panel({
  serviceId,
  conFoto,
  vistas,
}: {
  serviceId: string;
  conFoto: boolean;
  vistas: { id: string; angle: number }[];
}) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generar() {
    setError(null);
    for (let i = 0; i < ANGULOS.length; i += 1) {
      setTrabajando("Generando vista " + (i + 1) + " de " + ANGULOS.length + "...");
      const r = await fetch("/api/vistas360/" + serviceId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angulo: ANGULOS[i] }),
      }).catch(() => null);
      const datos = r ? await r.json().catch(() => ({})) : {};
      if (!r || !r.ok) {
        setError(datos.error ?? "No se pudo conectar. Intenta otra vez.");
        break;
      }
    }
    setTrabajando(null);
    router.refresh();
  }

  async function borrar() {
    if (!confirm("¿Quitar el 360 de este producto?")) return;
    setTrabajando("Quitando...");
    await fetch("/api/vistas360/" + serviceId, { method: "DELETE" }).catch(() => null);
    setTrabajando(null);
    router.refresh();
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-panel p-3">
      <p className="text-xs text-muted">
        La IA crea el lado derecho, la parte de atrás y el lado izquierdo a partir de la foto. Lo que no se ve en la foto lo
        imagina, así que revisa el resultado antes de dejarlo publicado.
      </p>

      {vistas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {[...vistas]
            .sort((a, b) => a.angle - b.angle)
            .map((v) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={v.id}
                src={"/vista/" + v.id}
                alt={"Vista a " + v.angle + " grados"}
                className="h-20 w-16 rounded-lg border border-line bg-white object-cover"
              />
            ))}
        </div>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-bad">{error}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={generar} disabled={!conFoto || trabajando !== null}>
          {trabajando ?? (vistas.length > 0 ? "Volver a generar" : "Generar 360 con IA")}
        </button>
        {vistas.length > 0 && !trabajando && (
          <button type="button" className="link text-xs" onClick={borrar}>
            Quitar 360
          </button>
        )}
        {!conFoto && <span className="text-xs text-subtle">Primero sube la foto del producto.</span>}
      </div>
    </div>
  );
}
