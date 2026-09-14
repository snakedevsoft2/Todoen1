"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { consentimientoUbicacionAction } from "@/actions/ubicacion";
import { guardarUbicacion, nuevaLlave, subirUbicaciones } from "@/lib/cola-pendientes";
import { contar } from "@/lib/cola-marcajes";
import { recordarPosicion } from "@/lib/ubicar";
import { Icon } from "./Icon";

/** Cada cuanto se anota la ubicacion. El servidor no guarda mas de una por minuto. */
const CADA_MS = 3 * 60_000;

type Estado = "buscando" | "compartiendo" | "sin-permiso" | "sin-gps";
type Bloqueo = { release: () => Promise<void> };

/**
 * La ubicacion durante la jornada, del lado del empleado.
 *
 * Primero se le pregunta si acepta, con lo que implica dicho sin letra
 * pequena. Si acepta, mientras tenga esta pantalla abierta y este entre su
 * entrada y su salida, el telefono anota su ubicacion cada pocos minutos y la
 * sube (o la guarda si no hay senal). Siempre se ve que se esta compartiendo,
 * y se puede dejar de compartir con un toque.
 *
 * Una pagina web no puede seguir enviando con el telefono bloqueado: por eso
 * existe la opcion de mantener la pantalla encendida.
 */
export function SeguimientoJornada({
  cuenta,
  activo,
  consentidoInicial,
  enJornada,
}: {
  cuenta: string;
  /** El negocio lo tiene activado. */
  activo: boolean;
  consentidoInicial: boolean;
  /** Tiene una entrada sin salida. */
  enJornada: boolean;
}) {
  const [consentido, setConsentido] = useState(consentidoInicial);
  const [preguntaCerrada, setPreguntaCerrada] = useState(false);
  const [estado, setEstado] = useState<Estado>("buscando");
  const [ultima, setUltima] = useState<string | null>(null);
  const [pantalla, setPantalla] = useState(false);
  const [puedeMantener, setPuedeMantener] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const posicion = useRef<GeolocationPosition | null>(null);
  const bloqueo = useRef<Bloqueo | null>(null);

  useEffect(() => setConsentido(consentidoInicial), [consentidoInicial]);
  useEffect(() => setPuedeMantener("wakeLock" in navigator), []);

  const subir = useCallback(async () => {
    try {
      // Primero tienen que haber llegado los marcajes: sin la entrada en el
      // servidor, la ubicacion se rechazaria por estar "fuera de la jornada".
      // Se vuelve a mirar en unos segundos, no en la siguiente ubicacion.
      if ((await contar()) > 0) {
        setTimeout(() => void subir(), 5000);
        return;
      }
      await subirUbicaciones(cuenta);
    } catch {
      // Se reintenta con la siguiente ubicacion.
    }
  }, [cuenta]);

  const anotar = useCallback(async () => {
    const p = posicion.current;
    if (!p) return;
    try {
      await guardarUbicacion({
        clientKey: nuevaLlave(),
        cuenta,
        at: new Date().toISOString(),
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracyM: Math.round(p.coords.accuracy),
        creadoEn: new Date().toISOString(),
      });
      setUltima(new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      // Sin IndexedDB no hay cola: se intenta con la siguiente.
    }
    void subir();
  }, [cuenta, subir]);

  const compartiendo = activo && enJornada && consentido;

  useEffect(() => {
    if (!compartiendo) return;
    if (!("geolocation" in navigator)) {
      setEstado("sin-gps");
      return;
    }
    let primera = true;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        posicion.current = p;
        // Asi "Llegué" usa esta lectura en vez de pedirle otra al GPS.
        recordarPosicion(p);
        setEstado("compartiendo");
        if (primera) {
          primera = false;
          void anotar();
        }
      },
      (e) => setEstado(e.code === 1 ? "sin-permiso" : "buscando"),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 30_000 }
    );
    const reloj = setInterval(() => void anotar(), CADA_MS);
    const volvio = () => void subir();
    window.addEventListener("online", volvio);
    return () => {
      navigator.geolocation.clearWatch(id);
      clearInterval(reloj);
      window.removeEventListener("online", volvio);
    };
  }, [compartiendo, anotar, subir]);

  const soltarPantalla = useCallback(async () => {
    await bloqueo.current?.release().catch(() => undefined);
    bloqueo.current = null;
  }, []);

  // El navegador suelta la pantalla encendida cuando se sale de la app: al
  // volver se pide otra vez. Al terminar la jornada se suelta.
  useEffect(() => {
    if (!pantalla || !compartiendo) {
      void soltarPantalla();
      return;
    }
    const pedir = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Bloqueo> } };
        if (document.visibilityState === "visible" && nav.wakeLock) bloqueo.current = await nav.wakeLock.request("screen");
      } catch {
        setPantalla(false);
      }
    };
    void pedir();
    const alVolver = () => void pedir();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      void soltarPantalla();
    };
  }, [pantalla, compartiendo, soltarPantalla]);

  async function decidir(acepta: boolean) {
    setOcupado(true);
    try {
      await consentimientoUbicacionAction(acepta);
      setConsentido(acepta);
      if (!acepta) setPreguntaCerrada(true);
    } catch {
      // Sin senal no se puede guardar la decision: se vuelve a preguntar.
    } finally {
      setOcupado(false);
    }
  }

  if (!activo || !enJornada) return null;

  if (!consentido) {
    if (preguntaCerrada) {
      return (
        <button type="button" className="text-[12px] font-semibold text-muted underline" onClick={() => setPreguntaCerrada(false)}>
          Compartir mi ubicación durante la jornada
        </button>
      );
    }
    return (
      <div data-consentimiento-ubicacion className="rounded-xl border border-brand-200 bg-brand-50 p-3.5 text-[13px] text-body">
        <p className="flex items-center gap-2 font-bold text-strong">
          <Icon name="map" className="h-4 w-4" />
          Tu empresa pide ver tu ubicación durante la jornada
        </p>
        <ul className="mt-2 space-y-1 text-[12px] leading-snug">
          <li>• Solo entre tu entrada y tu salida. Al marcar la salida se detiene.</li>
          <li>• Solo mientras tengas esta pantalla abierta.</li>
          <li>• Siempre vas a ver aquí que se está compartiendo, y puedes dejar de hacerlo cuando quieras.</li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary btn-sm" onClick={() => decidir(true)} disabled={ocupado}>
            Acepto compartir mi ubicación
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setPreguntaCerrada(true)} disabled={ocupado}>
            Ahora no
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-seguimiento={estado}
      className={
        "rounded-xl border px-3.5 py-2.5 text-[13px] " +
        (estado === "compartiendo"
          ? "border-good-line bg-good-soft text-good"
          : estado === "buscando"
            ? "border-line bg-surface text-muted"
            : "border-bad/30 bg-surface text-bad")
      }
    >
      <p className="flex items-start gap-2">
        <Icon name="map" className="mt-px h-4 w-4 shrink-0" />
        <span>
          {estado === "compartiendo"
            ? "Compartiendo tu ubicación con tu empresa" + (ultima ? " · última a las " + ultima : "") + ". Se detiene al marcar la salida."
            : estado === "buscando"
              ? "Buscando tu ubicación…"
              : estado === "sin-permiso"
                ? "El navegador no tiene permiso de ubicación. Actívalo en los ajustes del navegador para compartirla."
                : "Este teléfono no puede dar su ubicación."}
        </span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        {puedeMantener && (
          <label className="flex items-center gap-1.5 text-body">
            <input type="checkbox" className="h-4 w-4" checked={pantalla} onChange={(e) => setPantalla(e.target.checked)} />
            Mantener la pantalla encendida
          </label>
        )}
        <button type="button" className="font-semibold text-muted underline" onClick={() => decidir(false)} disabled={ocupado}>
          Dejar de compartir
        </button>
      </div>
    </div>
  );
}
