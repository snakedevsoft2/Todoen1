"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../Icon";

type Modo = "dibujar" | "escribir" | "subir";

/** Lo mas grande que se manda: la firma no necesita mas para verse nitida en el PDF. */
const LADO_MAX = 800;

/**
 * Recorta lo que no tiene tinta y devuelve la firma como PNG transparente.
 * Null si el lienzo esta vacio.
 */
function recortar(origen: HTMLCanvasElement): string | null {
  const ctx = origen.getContext("2d");
  if (!ctx) return null;
  const { width: W, height: H } = origen;
  const datos = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (datos[(y * W + x) * 4 + 3] > 20) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const margen = 6;
  x0 = Math.max(0, x0 - margen);
  y0 = Math.max(0, y0 - margen);
  x1 = Math.min(W - 1, x1 + margen);
  y1 = Math.min(H - 1, y1 + margen);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const escala = Math.min(1, LADO_MAX / Math.max(w, h));
  const salida = document.createElement("canvas");
  salida.width = Math.max(1, Math.round(w * escala));
  salida.height = Math.max(1, Math.round(h * escala));
  salida.getContext("2d")?.drawImage(origen, x0, y0, w, h, 0, 0, salida.width, salida.height);
  return salida.toDataURL("image/png");
}

/**
 * Una foto de una firma en papel: lo claro se vuelve transparente y lo oscuro
 * queda como tinta, para que sobre el documento no se vea el cuadro blanco.
 */
async function fotoAFirma(archivo: File): Promise<string | null> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const escala = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * escala);
    c.height = Math.round(img.height * escala);
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const datos = ctx.getImageData(0, 0, c.width, c.height);
    const p = datos.data;
    // Un PNG que ya trae transparencia se respeta tal cual.
    let transparente = false;
    for (let k = 3; k < p.length; k += 4 * 50) if (p[k] < 250) transparente = true;
    if (!transparente) {
      for (let k = 0; k < p.length; k += 4) {
        const luz = 0.299 * p[k] + 0.587 * p[k + 1] + 0.114 * p[k + 2];
        // Mas claro que 190 es papel; entre 120 y 190 se desvanece para no dejar bordes duros.
        p[k + 3] = luz > 190 ? 0 : luz < 120 ? 255 : Math.round(((190 - luz) / 70) * 255);
      }
      ctx.putImageData(datos, 0, 0);
    }
    return recortar(c);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Donde el cliente hace su firma: con el dedo, escribiendo su nombre o
 * subiendo la imagen de la firma que ya tiene. Las tres terminan en lo mismo,
 * una imagen PNG que se pone sobre el documento.
 */
export function PadFirma({
  nombre,
  fuentes,
  onListo,
}: {
  nombre: string;
  /** Las familias de letra cursiva, ya cargadas por la pagina. */
  fuentes: { etiqueta: string; familia: string }[];
  onListo: (png: string | null) => void;
}) {
  const [modo, setModo] = useState<Modo>("dibujar");
  const lienzo = useRef<HTMLCanvasElement>(null);
  const trazando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [hayTinta, setHayTinta] = useState(false);
  const [texto, setTexto] = useState(nombre);
  const [fuente, setFuente] = useState(0);
  const [subida, setSubida] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // El lienzo se ajusta al ancho de la pantalla y a su densidad, para que el trazo no salga pixelado.
  useEffect(() => {
    if (modo !== "dibujar") return;
    const c = lienzo.current;
    if (!c) return;
    const densidad = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(c.clientWidth * densidad);
    c.height = Math.round(c.clientHeight * densidad);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1f4d";
    ctx.lineWidth = 2.6 * densidad;
    setHayTinta(false);
  }, [modo]);

  function punto(e: ReactPointerEvent<HTMLCanvasElement>) {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  function bajar(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    trazando.current = true;
    const p = punto(e);
    ultimo.current = p;
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#0b1f4d";
      ctx.fill();
    }
    setHayTinta(true);
  }

  function trazar(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!trazando.current || !ultimo.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    // Los puntos que el navegador junto entre dos eventos: sin ellos la curva sale en picos.
    const eventos = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent];
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    for (const ev of eventos) {
      const p = { x: ((ev.clientX - r.left) / r.width) * c.width, y: ((ev.clientY - r.top) / r.height) * c.height };
      const medio = { x: (ultimo.current.x + p.x) / 2, y: (ultimo.current.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(ultimo.current.x, ultimo.current.y);
      ctx.quadraticCurveTo(ultimo.current.x, ultimo.current.y, medio.x, medio.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ultimo.current = p;
    }
  }

  function levantar() {
    trazando.current = false;
    ultimo.current = null;
  }

  function borrar() {
    const c = lienzo.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHayTinta(false);
  }

  async function escrita(): Promise<string | null> {
    const t = texto.trim();
    if (!t) return null;
    const familia = fuentes[fuente]?.familia ?? "cursive";
    try {
      await document.fonts.load("96px " + familia);
    } catch {
      // Sin la letra cursiva sale con la del sistema: igual es una firma.
    }
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.font = "96px " + familia;
    const ancho = Math.ceil(ctx.measureText(t).width) + 60;
    c.width = Math.min(2400, ancho);
    c.height = 190;
    ctx.font = "96px " + familia;
    ctx.fillStyle = "#0b1f4d";
    ctx.textBaseline = "middle";
    ctx.fillText(t, 30, 95, c.width - 60);
    return recortar(c);
  }

  async function usar() {
    setError(null);
    let png: string | null = null;
    if (modo === "dibujar") png = lienzo.current ? recortar(lienzo.current) : null;
    else if (modo === "escribir") png = await escrita();
    else png = subida;
    if (!png) {
      setError(modo === "dibujar" ? "Dibuja tu firma en el recuadro." : modo === "escribir" ? "Escribe tu nombre." : "Sube la imagen de tu firma.");
      return;
    }
    onListo(png);
  }

  const pestaña = (m: Modo, etiqueta: string) => (
    <button
      type="button"
      onClick={() => {
        setModo(m);
        setError(null);
      }}
      className={
        "flex-1 rounded-lg px-2 py-2 text-[13px] font-semibold " + (modo === m ? "bg-panel text-strong shadow-sm" : "text-muted")
      }
    >
      {etiqueta}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {pestaña("dibujar", "Dibujar")}
        {pestaña("escribir", "Escribir")}
        {pestaña("subir", "Subir imagen")}
      </div>

      {modo === "dibujar" && (
        <div>
          <div className="relative">
            <canvas
              ref={lienzo}
              onPointerDown={bajar}
              onPointerMove={trazar}
              onPointerUp={levantar}
              onPointerCancel={levantar}
              className="h-44 w-full cursor-crosshair rounded-xl border-2 border-dashed border-line-strong bg-white"
              style={{ touchAction: "none" }}
              aria-label="Recuadro para dibujar la firma"
            />
            {!hayTinta && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-subtle">
                Firma aquí con el dedo
              </span>
            )}
            <span className="pointer-events-none absolute bottom-8 left-6 right-6 border-b border-line-strong" />
          </div>
          <button type="button" onClick={borrar} className="btn-ghost btn-sm mt-1.5">
            <Icon name="trash" className="h-4 w-4" /> Borrar y volver a firmar
          </button>
        </div>
      )}

      {modo === "escribir" && (
        <div className="space-y-2">
          <input className="input" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={60} placeholder="Tu nombre" />
          <div className="grid gap-2 sm:grid-cols-2">
            {fuentes.map((f, i) => (
              <button
                key={f.familia}
                type="button"
                onClick={() => setFuente(i)}
                className={
                  "truncate rounded-xl border-2 bg-white px-3 py-2 text-left text-3xl text-[#0b1f4d] " +
                  (fuente === i ? "border-brand-600" : "border-line")
                }
                style={{ fontFamily: f.familia }}
                aria-label={"Letra " + f.etiqueta}
              >
                {texto.trim() || "Tu firma"}
              </button>
            ))}
          </div>
        </div>
      )}

      {modo === "subir" && (
        <div className="space-y-2">
          <p className="text-[13px] text-muted">
            Sube la imagen de tu firma digital o tómale una foto a tu firma en una hoja blanca. El fondo blanco se quita solo.
          </p>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="block w-full text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setError(null);
              const png = await fotoAFirma(f);
              if (!png) setError("No se pudo leer esa imagen.");
              setSubida(png);
            }}
          />
          {subida && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={subida} alt="Tu firma" className="max-h-32 rounded-xl border border-line bg-white p-2" />
          )}
        </div>
      )}

      {error && <p className="text-sm font-semibold text-bad">{error}</p>}

      <button type="button" onClick={usar} className="btn-primary w-full">
        <Icon name="check" className="h-4 w-4" /> Usar esta firma
      </button>
    </div>
  );
}
