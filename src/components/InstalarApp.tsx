"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  detectarDispositivo,
  escucharInstalacion,
  hayAvisoInstalacion,
  pedirInstalacion,
  suscribirInstalacion,
  type Dispositivo,
} from "@/lib/instalar";
import { Icon } from "./Icon";

const CLAVE_AHORA_NO = "ten_aviso_instalar";

/** Los pasos para instalar en cada celular y navegador. */
const PASOS: Record<Exclude<Dispositivo, "instalada">, { titulo: string; pasos: string[]; copiar?: boolean }> = {
  android: {
    titulo: "En Chrome",
    pasos: ["Toca los tres puntos ⋮ arriba a la derecha.", "Toca «Instalar aplicación» o «Agregar a pantalla principal».", "Confirma con «Instalar»."],
  },
  samsung: {
    titulo: "En Samsung Internet",
    pasos: ["Toca el menú ≡ abajo a la derecha.", "Toca «Agregar página a» y luego «Pantalla de inicio».", "Confirma con «Agregar»."],
  },
  "firefox-android": {
    titulo: "En Firefox",
    pasos: ["Toca los tres puntos ⋮.", "Toca «Instalar».", "Confirma con «Agregar»."],
  },
  "android-otro": {
    titulo: "Este navegador no instala bien la aplicación",
    pasos: ["Copia el enlace con el botón de abajo.", "Ábrelo en Google Chrome.", "Toca ⋮ y luego «Instalar aplicación»."],
    copiar: true,
  },
  "ios-safari": {
    titulo: "En iPhone o iPad",
    pasos: [
      "Toca el botón Compartir: el cuadro con la flecha hacia arriba, abajo en el centro.",
      "Baja y toca «Agregar a inicio».",
      "Toca «Agregar» arriba a la derecha.",
    ],
  },
  "ios-otro": {
    titulo: "En iPhone o iPad",
    pasos: [
      "Toca el botón Compartir: el cuadro con la flecha hacia arriba.",
      "Toca «Agregar a inicio». Si no aparece, copia el enlace y ábrelo en Safari.",
      "Toca «Agregar».",
    ],
    copiar: true,
  },
  "app-interna": {
    titulo: "Estás dentro de otra aplicación",
    pasos: [
      "Desde aquí no se puede instalar. Toca los tres puntos o el menú de esta ventana.",
      "Toca «Abrir en el navegador» (Chrome o Safari). O copia el enlace y pégalo allá.",
      "Allí toca «Instalar aplicación» o, en iPhone, Compartir y «Agregar a inicio».",
    ],
    copiar: true,
  },
  escritorio: {
    titulo: "En el computador",
    pasos: [
      "En Chrome o Edge, toca el ícono de instalar en la barra de direcciones: una pantalla con una flecha.",
      "O abre el menú ⋮ y toca «Instalar Todoen1».",
      "Confirma con «Instalar».",
    ],
  },
};

/**
 * Instalar la aplicacion, en cualquier celular.
 *
 * - "aviso": una franja arriba del panel, solo en el celular y hasta que la
 *   persona la instale o toque "Ahora no".
 * - "boton": el boton fijo del menu.
 *
 * Donde el navegador lo permite, "Instalar" abre la ventana de instalacion;
 * donde no (iPhone, Firefox, apps internas...), muestra los pasos de ese
 * celular. Si ya esta instalada, no se muestra nada.
 */
export function InstalarApp({ variante }: { variante: "aviso" | "boton" }) {
  const [dispositivo, setDispositivo] = useState<Dispositivo | null>(null);
  const [ahoraNo, setAhoraNo] = useState(true);
  const [pasos, setPasos] = useState(false);
  const [aviso, setAviso] = useState("");
  const puedePedir = useSyncExternalStore(suscribirInstalacion, hayAvisoInstalacion, () => false);

  useEffect(() => {
    escucharInstalacion();
    const nav = navigator as Navigator & { standalone?: boolean };
    const instalada = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    setDispositivo(detectarDispositivo(navigator.userAgent, instalada, navigator.maxTouchPoints > 1));
    try {
      setAhoraNo(localStorage.getItem(CLAVE_AHORA_NO) === "no");
    } catch {
      setAhoraNo(false);
    }
  }, []);

  if (!dispositivo || dispositivo === "instalada") return null;
  if (variante === "aviso" && (ahoraNo || dispositivo === "escritorio")) return null;

  async function instalar() {
    setAviso("");
    if (puedePedir) {
      const r = await pedirInstalacion();
      if (r === "aceptada") {
        setAviso("Listo: la aplicación quedó instalada. Búscala en tu pantalla de inicio.");
        return;
      }
      if (r === "rechazada") return;
    }
    setPasos(true);
  }

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(location.origin + "/login");
      setAviso("Enlace copiado. Pégalo en el navegador.");
    } catch {
      setAviso("Copia este enlace: " + location.origin + "/login");
    }
  }

  function noAhora() {
    try {
      localStorage.setItem(CLAVE_AHORA_NO, "no");
    } catch {
      // Sin almacenamiento, se oculta solo en esta visita.
    }
    setAhoraNo(true);
  }

  const guia = PASOS[dispositivo];

  return (
    <>
      {variante === "aviso" ? (
        <div data-aviso-instalar className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-body">
          <Icon name="download" className="h-4 w-4 shrink-0 text-brand-600" />
          <span className="min-w-0 flex-1">Instala Todoen1 en tu celular: se abre como una aplicación y funciona sin internet.</span>
          <span className="flex gap-2">
            <button type="button" onClick={instalar} className="btn-primary btn-sm">
              Instalar
            </button>
            <button type="button" onClick={noAhora} className="btn-ghost btn-sm">
              Ahora no
            </button>
          </span>
          {aviso && <p className="w-full text-[12px] text-good" role="status">{aviso}</p>}
        </div>
      ) : (
        <button type="button" onClick={instalar} className="btn-ghost btn-sm w-full justify-start" data-boton-instalar>
          <Icon name="download" className="h-4 w-4" />
          Instalar la aplicación
        </button>
      )}

      {pasos && (
        <>
          <div className="fixed inset-0 z-[65] bg-black/40" aria-hidden="true" onClick={() => setPasos(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cómo instalar la aplicación"
            data-instalar-pasos={dispositivo}
            className="fixed inset-x-3 bottom-3 z-[70] max-h-[85vh] overflow-y-auto rounded-2xl border border-line bg-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-left shadow-lg sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[380px] sm:-translate-x-1/2 sm:-translate-y-1/2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-base text-strong">{guia.titulo}</p>
              <button type="button" onClick={() => setPasos(false)} className="text-[12px] font-semibold text-muted">
                Cerrar
              </button>
            </div>
            <ol className="mt-3 space-y-2.5">
              {guia.pasos.map((p, i) => (
                <li key={i} className="flex gap-3 text-[14px] leading-snug text-body">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[12px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
            {guia.copiar && (
              <button type="button" onClick={copiarEnlace} className="btn-ghost btn-sm mt-3 w-full justify-center">
                <Icon name="link" className="h-4 w-4" />
                Copiar enlace
              </button>
            )}
            <p className="mt-3 text-[12px] text-muted">
              Una vez instalada, ábrela con internet la primera vez para que quede lista para usar sin señal.
            </p>
            {aviso && (
              <p className="mt-2 text-[12px] text-good" role="status">
                {aviso}
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}
