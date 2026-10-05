"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { abrirPdf, dibujarPagina } from "@/lib/pdf-visor";
import { MAX_SPOTS, SPOT_NUEVO, normalizarSpots, type Spot } from "@/lib/firma-spots";
import { Icon } from "../Icon";

/**
 * Las paginas de un PDF una debajo de otra, con las firmas encima.
 *
 * Cada firma es una caja que se arrastra con el dedo o el mouse, se agranda
 * desde la esquina y se puede soltar en otra pagina. Lo usan el negocio (para
 * marcar donde se firma) y el cliente (para poner su firma donde va).
 */
export function VisorFirmas({
  url,
  paginas,
  spots,
  onChange,
  firma,
  editable = true,
}: {
  url: string;
  paginas: number;
  spots: Spot[];
  onChange?: (spots: Spot[]) => void;
  /** La imagen de la firma. Sin ella, la caja dice "Firma aquí". */
  firma?: string | null;
  editable?: boolean;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const hojas = useRef<(HTMLDivElement | null)[]>([]);
  const lienzos = useRef<(HTMLCanvasElement | null)[]>([]);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ancho, setAncho] = useState(0);
  const [proporciones, setProporciones] = useState<number[]>([]);
  // Mientras se arrastra, la caja se mueve aqui y no en el padre: soltar es lo que guarda.
  const [arrastre, setArrastre] = useState<{ i: number; spot: Spot } | null>(null);
  const gesto = useRef<{
    i: number;
    modo: "mover" | "agrandar";
    x0: number;
    y0: number;
    inicial: Spot;
    anchoHoja: number;
    altoHoja: number;
  } | null>(null);

  useEffect(() => {
    let vivo = true;
    setPdf(null);
    setError(null);
    abrirPdf(url)
      .then((d) => vivo && setPdf(d))
      .catch(() => vivo && setError("No se pudo abrir el documento. Revisa tu conexión y vuelve a cargar."));
    return () => {
      vivo = false;
    };
  }, [url]);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const medir = () => {
      if (espera) clearTimeout(espera);
      // Que girar el telefono no redibuje veinte veces seguidas.
      espera = setTimeout(() => setAncho(Math.round(el.clientWidth)), 150);
    };
    setAncho(Math.round(el.clientWidth));
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (espera) clearTimeout(espera);
    };
  }, []);

  useEffect(() => {
    if (!pdf || !ancho) return;
    let vivo = true;
    (async () => {
      const nuevas: number[] = [];
      for (let n = 1; n <= pdf.numPages && vivo; n++) {
        const canvas = lienzos.current[n - 1];
        if (!canvas) continue;
        try {
          nuevas[n - 1] = await dibujarPagina(pdf, n, canvas, ancho);
        } catch {
          nuevas[n - 1] = 1.294;
        }
        if (vivo) setProporciones((p) => Object.assign([...p], { [n - 1]: nuevas[n - 1] }));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [pdf, ancho]);

  const total = pdf?.numPages ?? paginas;

  function empezar(e: ReactPointerEvent, i: number, modo: "mover" | "agrandar") {
    if (!editable) return;
    const hoja = hojas.current[spots[i].page - 1];
    if (!hoja) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = hoja.getBoundingClientRect();
    gesto.current = { i, modo, x0: e.clientX, y0: e.clientY, inicial: spots[i], anchoHoja: r.width, altoHoja: r.height };
    setArrastre({ i, spot: spots[i] });
  }

  function mover(e: ReactPointerEvent) {
    const g = gesto.current;
    if (!g) return;
    const dx = (e.clientX - g.x0) / g.anchoHoja;
    const dy = (e.clientY - g.y0) / g.altoHoja;
    const s = g.inicial;
    setArrastre({
      i: g.i,
      spot:
        g.modo === "mover"
          ? { ...s, x: s.x + dx, y: s.y + dy }
          : { ...s, w: Math.max(0.05, Math.min(1 - s.x, s.w + dx)), h: Math.max(0.03, Math.min(1 - s.y, s.h + dy)) },
    });
  }

  function soltar(e: ReactPointerEvent) {
    const g = gesto.current;
    gesto.current = null;
    if (!g || !arrastre) {
      setArrastre(null);
      return;
    }
    let spot = arrastre.spot;
    if (g.modo === "mover") {
      // Si el centro de la caja quedo sobre otra pagina, se pasa a esa.
      const caja = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const cx = caja.left + caja.width / 2;
      const cy = caja.top + caja.height / 2;
      hojas.current.forEach((hoja, n) => {
        if (!hoja || n + 1 === spot.page) return;
        const r = hoja.getBoundingClientRect();
        if (cy >= r.top && cy <= r.bottom && cx >= r.left - 40 && cx <= r.right + 40) {
          spot = {
            ...spot,
            page: n + 1,
            x: (caja.left - r.left) / r.width,
            y: (caja.top - r.top) / r.height,
            w: caja.width / r.width,
            h: caja.height / r.height,
          };
        }
      });
    }
    setArrastre(null);
    const lista = spots.map((s, k) => (k === g.i ? spot : s));
    onChange?.(normalizarSpots(lista, total));
  }

  function agregar(pagina: number) {
    if (spots.length >= MAX_SPOTS) return;
    const ya = spots.filter((s) => s.page === pagina).length;
    const nuevo: Spot = {
      page: pagina,
      x: 0.5 - SPOT_NUEVO.w / 2,
      y: Math.min(0.85, 0.45 + ya * 0.12),
      ...SPOT_NUEVO,
    };
    onChange?.(normalizarSpots([...spots, nuevo], total));
  }

  function quitar(i: number) {
    onChange?.(spots.filter((_, k) => k !== i));
  }

  return (
    <div ref={contenedor} className="w-full min-w-0 select-none">
      {error && <p className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-bad">{error}</p>}
      {!pdf && !error && <p className="py-10 text-center text-sm text-muted">Abriendo el documento…</p>}

      <div className={pdf ? "space-y-4" : "hidden"}>
        {Array.from({ length: total }, (_, n) => {
          const pagina = n + 1;
          const enEsta = spots.map((s, i) => ({ s: arrastre?.i === i ? arrastre.spot : s, i })).filter((x) => x.s.page === pagina);
          return (
            <div key={pagina}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-[12px] text-muted">
                <span>
                  Página {pagina} de {total}
                </span>
                {editable && (
                  <button
                    type="button"
                    onClick={() => agregar(pagina)}
                    className="btn-ghost btn-sm"
                    disabled={spots.length >= MAX_SPOTS}
                  >
                    <Icon name="plus" className="h-4 w-4" /> Firma en esta página
                  </button>
                )}
              </div>
              <div
                ref={(el) => {
                  hojas.current[n] = el;
                }}
                className="relative w-full bg-white shadow-sm ring-1 ring-line"
                style={{ aspectRatio: "1 / " + (proporciones[n] ?? 1.294) }}
              >
                <canvas
                  ref={(el) => {
                    lienzos.current[n] = el;
                  }}
                  className="absolute inset-0 h-full w-full"
                />
                {enEsta.map(({ s, i }) => (
                  <div
                    key={i}
                    data-firma-caja
                    className={
                      "absolute rounded-md border-2 border-dashed " +
                      (editable ? "cursor-move border-brand-600 bg-brand-500/10" : "border-transparent") +
                      (arrastre?.i === i ? " z-20 shadow-lg" : " z-10")
                    }
                    style={{
                      left: s.x * 100 + "%",
                      top: s.y * 100 + "%",
                      width: s.w * 100 + "%",
                      height: s.h * 100 + "%",
                      touchAction: editable ? "none" : undefined,
                    }}
                    onPointerDown={(e) => empezar(e, i, "mover")}
                    onPointerMove={mover}
                    onPointerUp={soltar}
                    onPointerCancel={soltar}
                  >
                    {firma ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={firma} alt="Tu firma" draggable={false} className="pointer-events-none h-full w-full object-contain" />
                    ) : (
                      <span className="pointer-events-none flex h-full w-full items-center justify-center text-center text-[11px] font-semibold leading-tight text-brand-700">
                        Firma aquí
                      </span>
                    )}
                    {editable && (
                      <>
                        <button
                          type="button"
                          aria-label="Quitar esta firma"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => quitar(i)}
                          className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-bad text-white shadow"
                        >
                          <Icon name="x" className="h-3.5 w-3.5" />
                        </button>
                        <span
                          aria-label="Agrandar o achicar"
                          onPointerDown={(e) => empezar(e, i, "agrandar")}
                          onPointerMove={mover}
                          onPointerUp={soltar}
                          onPointerCancel={soltar}
                          className="absolute -bottom-2.5 -right-2.5 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-brand-600 shadow"
                          style={{ touchAction: "none" }}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
