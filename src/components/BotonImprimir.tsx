"use client";

import { useEffect, useRef, useState } from "react";
import { conexionGuardada, formatoGuardado, guardarConexion, guardarFormato, imprimirHtml } from "@/lib/imprimir";
import { CONEXIONES, conexionesDisponibles, imprimirDirecto, type Conexion } from "@/lib/impresora-directa";
import { tirillaEscPos } from "@/lib/escpos";
import { FORMATOS, tirillaHtml, type Formato, type Linea } from "@/lib/tirilla";
import { Icon } from "./Icon";

/**
 * Imprimir un recibo en la impresora de verdad, con senal o sin ella.
 *
 * Pregunta el tamano la primera vez y despues no vuelve a estorbar: se queda
 * con el tamano y la forma de conexion que se usaron en ESTE equipo. El
 * computador del local y el celular del cobrador guardan los suyos, que es lo
 * correcto porque tienen impresoras distintas.
 *
 * La flechita deja cambiarlos. Elegir una conexion directa desde ahi abre la
 * lista de impresoras para escoger cual; el boton grande usa la ultima.
 */
export function BotonImprimir({
  /** Renglones del recibo. */
  tirilla,
  nombreArchivo,
  /** Logo del negocio, solo para la hoja completa. */
  logoUrl,
  /** Texto del boton. "Imprimir" en la mayoria de sitios. */
  label = "Imprimir",
  className = "btn-ghost btn-sm",
  /** Hacia donde se abre el menu, para que no se salga de la pantalla. */
  menu = "derecha",
}: {
  tirilla: () => Linea[];
  nombreArchivo: string;
  logoUrl?: string | null;
  label?: string;
  className?: string;
  menu?: "derecha" | "izquierda";
}) {
  const [formato, setFormato] = useState<Formato | null>(null);
  const [conexion, setConexion] = useState<Conexion>("sistema");
  const [disponibles, setDisponibles] = useState<Conexion[]>(["sistema"]);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  // Lo guardado solo existe en el navegador, asi que se lee despues de pintar:
  // leerlo antes haria que el servidor y el cliente no coincidan.
  useEffect(() => {
    const hay = conexionesDisponibles();
    const guardada = conexionGuardada();
    setDisponibles(hay);
    setFormato(formatoGuardado());
    setConexion(guardada && hay.includes(guardada) ? guardada : "sistema");
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

  async function imprimir(f: Formato, c: Conexion, elegirOtra = false) {
    setAbierto(false);
    setOcupado(true);
    setAviso(null);
    guardarFormato(f);
    setFormato(f);
    guardarConexion(c);
    setConexion(c);

    // La hoja completa siempre va por el dialogo: una termica no la saca.
    const directa = f !== "a4" && c !== "sistema";
    try {
      if (directa) {
        // Sin nada que espere antes: el navegador solo deja buscar la
        // impresora justo despues del toque.
        const r = await imprimirDirecto(c, tirillaEscPos(tirilla(), f === "58" ? 58 : 80), elegirOtra);
        setAviso(r === "impreso" ? { tono: "ok", texto: "Enviado a la impresora." } : null);
      } else {
        await imprimirHtml(tirillaHtml(tirilla(), f, logoUrl), f, nombreArchivo.replace(/\.pdf$/i, ""));
      }
    } catch (error) {
      const texto = error instanceof Error ? error.message : "No pudimos preparar la impresión.";
      setAviso({
        tono: "error",
        texto: directa && !/diálogo/.test(texto) ? texto + " También puedes imprimir con el diálogo de impresión." : texto,
      });
    } finally {
      setOcupado(false);
    }
  }

  const marca = <span className="ml-1.5 text-[11px] text-muted">· la que usas</span>;

  return (
    <div className="relative" ref={caja}>
      <div className="flex">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => (formato ? imprimir(formato, conexion) : setAbierto(true))}
          className={className + " rounded-r-none"}
        >
          <Icon name="print" className="h-4 w-4" />
          {ocupado ? "Imprimiendo..." : label}
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
        <>
          {/* En el celular y la tableta el menu sale desde abajo, a lo ancho de
              la pantalla: pegado al boton se salia por un lado y no se veia. */}
          <div className="fixed inset-0 z-[65] bg-black/30 lg:hidden" aria-hidden="true" onClick={() => setAbierto(false)} />
          <div
            data-menu-imprimir
            className={
              "fixed inset-x-3 bottom-3 z-[70] max-h-[75vh] overflow-y-auto rounded-2xl border border-line bg-panel pb-[env(safe-area-inset-bottom)] shadow-lg " +
              "lg:absolute lg:inset-x-auto lg:bottom-auto lg:z-30 lg:mt-1 lg:max-h-[70vh] lg:w-64 lg:rounded-xl lg:pb-0 " +
              (menu === "izquierda" ? "lg:left-0" : "lg:right-0")
            }
          >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <p className="text-[11px] text-subtle">¿En qué papel?</p>
            <button type="button" onClick={() => setAbierto(false)} className="text-[12px] font-semibold text-muted lg:hidden">
              Cerrar
            </button>
          </div>
          {FORMATOS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => imprimir(f.value, conexion)}
              className="block w-full px-3 py-2.5 text-left transition hover:bg-soft"
            >
              <span className="block text-[13px] font-bold text-strong">
                {f.label}
                {formato === f.value && marca}
              </span>
              <span className="block text-[11px] leading-snug text-muted">{f.hint}</span>
            </button>
          ))}

          {disponibles.length > 1 && (
            <>
              <p className="border-y border-line px-3 py-2 text-[11px] text-subtle">¿Cómo está conectada?</p>
              {CONEXIONES.filter((c) => disponibles.includes(c.value)).map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() =>
                    c.value === "sistema"
                      ? imprimir(formato ?? "58", "sistema")
                      : imprimir(formato === "80" ? "80" : "58", c.value, true)
                  }
                  className="block w-full px-3 py-2.5 text-left transition hover:bg-soft"
                >
                  <span className="block text-[13px] font-bold text-strong">
                    {c.label}
                    {formato && conexion === c.value && marca}
                  </span>
                  <span className="block text-[11px] leading-snug text-muted">{c.hint}</span>
                </button>
              ))}
            </>
          )}
          </div>
        </>
      )}

      {aviso && (
        <p className={"mt-1 max-w-xs text-[11px] " + (aviso.tono === "error" ? "text-bad" : "text-good")}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
