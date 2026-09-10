"use client";

import { useEffect, useRef, useState } from "react";
import { createDecoder, feedback, normalizeCode } from "@/lib/barcode";
import { Icon } from "./Icon";

/** Cada cuanto miramos un fotograma. Mas seguido no lee mejor y calienta el equipo. */
const INTERVALO_MS = 140;
/** Ancho al que reducimos el fotograma antes de leerlo. */
const ANCHO_LECTURA = 720;

/**
 * Pantalla de escaneo con la camara.
 *
 * Se abre encima de todo, lee, avisa con un pito y se cierra sola. Si la camara
 * no se puede usar (permiso negado, computador sin camara, navegador viejo)
 * deja escribir el codigo a mano, que es lo que hay que hacer igual cuando la
 * etiqueta esta rota.
 */
export function BarcodeScanner({
  onDetect,
  onClose,
  title = "Escanear codigo",
}: {
  onDetect: (code: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelado = false;

    async function arrancar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no deja usar la camara. Escribe el codigo a mano.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // La camara de atras es la que apunta a la etiqueta.
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch (e) {
        const nombre = e instanceof DOMException ? e.name : "";
        setError(
          nombre === "NotAllowedError"
            ? "No diste permiso para la camara. Puedes escribir el codigo a mano."
            : nombre === "NotFoundError"
              ? "No encontramos camara en este dispositivo. Escribe el codigo a mano."
              : "No pudimos abrir la camara. Escribe el codigo a mano."
        );
        return;
      }

      if (cancelado) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      try {
        await video.play();
      } catch {
        // Algunos navegadores lo reproducen solos; si falla seguimos igual.
      }
      setReady(true);

      let decoder;
      try {
        decoder = await createDecoder();
      } catch {
        setError("No pudimos preparar el lector. Escribe el codigo a mano.");
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const mirar = async () => {
        if (cancelado) return;
        const ancho = video.videoWidth;
        const alto = video.videoHeight;

        if (ancho && alto) {
          const escala = Math.min(1, ANCHO_LECTURA / ancho);
          canvas.width = Math.round(ancho * escala);
          canvas.height = Math.round(alto * escala);
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
              const code = await decoder.read(canvas);
              if (code && !cancelado) {
                feedback();
                onDetect(code);
                return;
              }
            } catch {
              // Un fotograma malo no debe tumbar el escaneo.
            }
          }
        }

        if (!cancelado) timer = setTimeout(mirar, INTERVALO_MS);
      };

      timer = setTimeout(mirar, INTERVALO_MS);
    }

    arrancar();

    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  function enviarManual(event: React.FormEvent) {
    event.preventDefault();
    const code = normalizeCode(manual);
    if (code) onDetect(code);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-label={title}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-panel shadow-xl">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <p className="text-sm font-bold text-strong">{title}</p>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm px-2" aria-label="Cerrar">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-[4/3] bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />

          {/* Marco guia: el codigo se lee cuando queda dentro. */}
          {ready && !error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-[78%] rounded-xl border border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}

          {!ready && !error && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
              Abriendo la camara...
            </p>
          )}
        </div>

        <div className="space-y-3 px-4 py-3">
          {error ? (
            <p className="rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">
              {error}
            </p>
          ) : (
            <p className="text-xs text-subtle">
              Apunta al codigo de barras de la etiqueta. Se lee solo.
            </p>
          )}

          <form onSubmit={enviarManual} className="flex gap-2">
            <input
              className="input py-1.5 text-sm"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="O escribe el codigo"
              inputMode="text"
              autoFocus={Boolean(error)}
            />
            <button type="submit" className="btn-primary btn-sm" disabled={!manual.trim()}>
              Usar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
