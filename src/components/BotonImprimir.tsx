"use client";

import { useEffect, useRef, useState } from "react";
import { formatoGuardado, guardarFormato, imprimirPdf } from "@/lib/imprimir";
import { buildTirillaPdf, FORMATOS, type Formato, type Linea } from "@/lib/tirilla";
import { Icon } from "./Icon";

/**
 * Imprimir un recibo en la impresora de verdad.
 *
 * Pregunta el tamano la primera vez y despues no vuelve a estorbar: se queda
 * con el que se uso en ESTE equipo. El computador del local y el celular del
 * cobrador guardan el suyo, que es lo correcto porque tienen impresoras
 * distintas.
 *
 * La flechita deja cambiarlo cuando haga falta.
 */
export function BotonImprimir({
  /** Renglones para el papel de tirilla. */
  tirilla,
  /** El PDF de hoja completa, que ya sabe armar cada recibo. */
  hoja,
  nombreArchivo,
  /** Texto del boton. "Imprimir" en la mayoria de sitios. */
  label = "Imprimir",
  className = "btn-ghost btn-sm",
}: {
  tirilla: () => Linea[];
  hoja: () => Promise<File>;
  nombreArchivo: string;
  label?: string;
  className?: string;
}) {
  const [formato, setFormato] = useState<Formato | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  // El tamano guardado solo existe en el navegador, asi que se lee despues de
  // pintar: leerlo antes haria que el servidor y el cliente no coincidan.
  useEffect(() => {
    setFormato(formatoGuardado());
  }, []);

  // Cerrar el menu al tocar por fuera. Sin esto se queda abierto tapando la
  // pantalla en el celular.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  async function imprimir(f: Formato) {
    setAbierto(false);
    setOcupado(true);
    setAviso(null);
    try {
      guardarFormato(f);
      setFormato(f);

      const file =
        f === "a4"
          ? await hoja()
          : await buildTirillaPdf(tirilla(), f === "58" ? 58 : 80, nombreArchivo);

      const como = await imprimirPdf(file);
      setAviso(
        como === "dialogo"
          ? null
          : "Se abrio el recibo en otra pestana: desde ahi dale imprimir o compartir."
      );
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "No pudimos preparar la impresion.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="relative" ref={caja}>
      <div className="flex">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => (formato ? imprimir(formato) : setAbierto(true))}
          className={className + " rounded-r-none"}
        >
          <Icon name="print" className="h-4 w-4" />
          {ocupado ? "Preparando..." : label}
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => setAbierto(!abierto)}
          aria-label="Elegir tamano de impresion"
          className={className + " rounded-l-none border-l-0 px-2"}
        >
          <span aria-hidden="true" className="text-[10px] leading-none">
            ▾
          </span>
        </button>
      </div>

      {abierto && (
        <div className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border border-line bg-panel shadow-lg">
          <p className="border-b border-line px-3 py-2 text-[11px] text-subtle">
            ¿En qué impresora?
          </p>
          {FORMATOS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => imprimir(f.value)}
              className="block w-full px-3 py-2.5 text-left transition hover:bg-soft"
            >
              <span className="block text-[13px] font-bold text-strong">
                {f.label}
                {formato === f.value && <span className="ml-1.5 text-[11px] text-muted">· la que usas</span>}
              </span>
              <span className="block text-[11px] leading-snug text-muted">{f.hint}</span>
            </button>
          ))}
        </div>
      )}

      {aviso && <p className="mt-1 text-[11px] text-muted">{aviso}</p>}
    </div>
  );
}
