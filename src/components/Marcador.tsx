"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  contar,
  guardar,
  nuevaLlave,
  sincronizar,
  type MarcajePendiente,
} from "@/lib/cola-marcajes";
import { prettyDistancia } from "@/lib/geo";
import { ubicar } from "@/lib/ubicar";
import { Icon } from "./Icon";
import { RegistrarSW } from "./RegistrarSW";
import { SeguimientoJornada } from "./SeguimientoJornada";
import { BotonLlegue } from "./BotonLlegue";

/**
 * El marcador de entrada y salida.
 *
 * Guarda primero en el telefono y manda despues. Esa es toda la idea: el
 * marcaje nunca depende de que haya senal en el momento de tocar el boton,
 * porque el sitio donde se trabaja no siempre tiene cobertura y la jornada de
 * una persona no se puede perder por eso.
 *
 * Por eso el boton NUNCA se queda esperando a la red. Guarda, confirma en
 * pantalla, y la sincronizacion ocurre aparte.
 *
 * Una entrada y una salida por jornada: despues de la salida el boton
 * desaparece y queda la jornada completa. El servidor aplica la misma regla
 * (lib/jornada-reglas.ts), por si el telefono se equivoca.
 */

type Sitio = { id: string; name: string };

/** Lo que le toca: marcar entrada, marcar salida, o ya termino por hoy. */
export type Siguiente = "ENTRADA" | "SALIDA" | "COMPLETA";

type Estado =
  | { fase: "listo" }
  | { fase: "ubicando" }
  | { fase: "guardado"; kind: "ENTRADA" | "SALIDA"; conUbicacion: boolean };

export function Marcador({
  sitios,
  siguienteInicial,
  cuenta,
  seguimiento,
  llegadas = true,
}: {
  sitios: Sitio[];
  /** Lo que le toca segun el servidor al abrir la pantalla. */
  siguienteInicial: Siguiente;
  /** La persona que marca: sus llegadas y ubicaciones pendientes son solo suyas. */
  cuenta: string;
  /** Si el negocio pide la ubicacion durante la jornada, y si esta persona acepto. */
  seguimiento: { activo: boolean; consentido: boolean };
  /** El boton "Llegué": es del plan completo. */
  llegadas?: boolean;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: "listo" });
  /*
   * Lo que le toca, llevado aqui y no solo leido del servidor.
   *
   * Sin senal no hay pagina nueva que diga que ya marco entrada, asi que el
   * telefono tiene que saberlo por su cuenta: si no, a los cuatro segundos el
   * boton volveria a decir "Marcar entrada".
   */
  const [siguiente, setSiguiente] = useState<Siguiente>(siguienteInicial);
  const [sitioId, setSitioId] = useState<string>(sitios[0]?.id ?? "");
  const [enCola, setEnCola] = useState(0);
  const [enLinea, setEnLinea] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => setSiguiente(siguienteInicial), [siguienteInicial]);

  const refrescarCola = useCallback(async () => {
    try {
      setEnCola(await contar());
    } catch {
      // Sin IndexedDB (navegador en privado muy cerrado) no se puede encolar.
    }
  }, []);

  const enviar = useCallback(async () => {
    try {
      const r = await sincronizar();
      if (r.rechazados.length > 0) {
        setAviso(
          "No se pudo registrar " +
            r.rechazados.length +
            (r.rechazados.length === 1 ? " marcaje: " : " marcajes: ") +
            (r.rechazados[0].motivo ?? "")
        );
      }
      await refrescarCola();
      return r;
    } catch {
      // Se reintenta en el proximo evento.
      return null;
    }
  }, [refrescarCola]);

  /*
   * Enviar y, SOLO si de verdad salio algo, pedir la pagina de nuevo.
   *
   * Pedir la pagina sin red no es inofensivo: Next no la consigue, cae a una
   * navegacion completa del navegador, y el telefono queda en la pagina de
   * error de "sin internet". Por eso se exige que haya red en este momento y
   * que el envio haya entregado o rechazado al menos un marcaje.
   */
  const enviarYRefrescar = useCallback(async () => {
    const r = await enviar();
    if (r && r.huboRed && (r.enviados > 0 || r.rechazados.length > 0) && navigator.onLine) router.refresh();
  }, [enviar, router]);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    void refrescarCola();
    void enviar();

    const volvio = () => {
      setEnLinea(true);
      void enviarYRefrescar();
    };
    const cayo = () => setEnLinea(false);

    window.addEventListener("online", volvio);
    window.addEventListener("offline", cayo);
    // Al volver a la pantalla tambien: el evento "online" no siempre llega en
    // el celular cuando la aplicacion estuvo en segundo plano.
    const alVolver = () => {
      if (document.visibilityState === "visible") void enviarYRefrescar();
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      window.removeEventListener("online", volvio);
      window.removeEventListener("offline", cayo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [enviar, enviarYRefrescar, refrescarCola]);

  async function marcar(kind: "ENTRADA" | "SALIDA") {
    setAviso(null);
    setEstado({ fase: "ubicando" });

    const pos = await ubicar();

    const m: MarcajePendiente = {
      clientKey: nuevaLlave(),
      kind,
      markedAt: new Date().toISOString(),
      siteId: sitioId || null,
      lat: pos?.coords.latitude ?? null,
      lng: pos?.coords.longitude ?? null,
      accuracyM: pos ? Math.round(pos.coords.accuracy) : null,
      note: null,
      intentos: 0,
    };

    try {
      await guardar(m);
    } catch {
      setEstado({ fase: "listo" });
      setAviso("Este navegador no deja guardar el marcaje. Prueba con Chrome o Safari normal.");
      return;
    }

    setEstado({ fase: "guardado", kind, conUbicacion: Boolean(pos) });
    setSiguiente(kind === "ENTRADA" ? "SALIDA" : "COMPLETA");
    await refrescarCola();
    void enviarYRefrescar();

    setTimeout(() => setEstado({ fase: "listo" }), 4000);
  }

  return (
    <div className="space-y-4">
      {/* Guarda esta pantalla en el telefono para poder abrirla sin senal. */}
      <RegistrarSW guardarEstaPagina />
      {/* El estado de la conexion se dice siempre, no solo cuando falla: la
          persona tiene que saber si su marcaje ya viajo o sigue esperando. */}
      <div
        className={
          "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] " +
          (enCola > 0
            ? "border-warn-line bg-warn-soft text-warn"
            : enLinea
              ? "border-line bg-surface text-muted"
              : "border-warn-line bg-warn-soft text-warn")
        }
      >
        <Icon name={enCola > 0 || !enLinea ? "clock" : "check"} className="h-4 w-4 shrink-0" />
        <span>
          {enCola > 0
            ? enCola + (enCola === 1 ? " marcaje esperando señal" : " marcajes esperando señal")
            : enLinea
              ? "Conectado. Lo que marques se envía al momento."
              : "Sin señal. Puedes marcar igual: se envía solo cuando vuelva."}
        </span>
      </div>

      {/* Durante la jornada (entrada sin salida), si el negocio lo pide. */}
      <SeguimientoJornada
        cuenta={cuenta}
        activo={seguimiento.activo}
        consentidoInicial={seguimiento.consentido}
        enJornada={siguiente === "SALIDA"}
      />

      {sitios.length > 0 && siguiente !== "COMPLETA" && (
        <label className="block">
          <span className="label">¿Dónde estás?</span>
          <select
            className="input"
            value={sitioId}
            onChange={(e) => setSitioId(e.target.value)}
            disabled={estado.fase === "ubicando"}
          >
            <option value="">Sin sitio</option>
            {sitios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {estado.fase === "guardado" ? (
        <div className="rounded-2xl border border-good-line bg-good-soft p-6 text-center">
          <Icon name="check" className="mx-auto h-10 w-10 text-good" />
          <p className="mt-3 text-lg font-bold text-good">
            {estado.kind === "ENTRADA" ? "Entrada registrada" : "Salida registrada"}
          </p>
          <p className="mt-1 text-[13px] text-good">
            {new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
            {estado.conUbicacion ? " · con tu ubicación" : " · sin ubicación"}
          </p>
        </div>
      ) : siguiente === "COMPLETA" ? (
        <div data-jornada-completa className="rounded-2xl border border-line bg-surface p-6 text-center">
          <Icon name="check" className="mx-auto h-10 w-10 text-good" />
          <p className="mt-3 text-lg font-bold text-strong">Tu jornada de hoy está completa</p>
          <p className="mt-1 text-[13px] text-muted">
            Ya marcaste entrada y salida. Mañana vuelves a marcar tu entrada.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => marcar(siguiente)}
          disabled={estado.fase === "ubicando"}
          className={
            "flex w-full flex-col items-center justify-center gap-2 rounded-2xl px-6 py-10 " +
            "text-white transition-transform duration-200 ease-suave active:scale-[0.97] " +
            "disabled:opacity-60 " +
            (siguiente === "ENTRADA" ? "bg-good-solid" : "bg-brand-600")
          }
        >
          <Icon name={siguiente === "ENTRADA" ? "arrowIn" : "arrowOut"} className="h-10 w-10" />
          <span className="text-xl font-bold">
            {estado.fase === "ubicando"
              ? "Tomando tu ubicación…"
              : siguiente === "ENTRADA"
                ? "Marcar entrada"
                : "Marcar salida"}
          </span>
          <span className="text-[13px] opacity-80">
            {estado.fase === "ubicando" ? "No cierres la pantalla" : "Toca una vez"}
          </span>
        </button>
      )}

      {llegadas && <BotonLlegue cuenta={cuenta} sitios={sitios} />}

      {aviso && (
        <p className="flex items-start gap-2 text-[13px] text-bad">
          <Icon name="alert" className="mt-px h-4 w-4 shrink-0" />
          <span>{aviso}</span>
        </p>
      )}

      <p className="text-center text-[11px] leading-relaxed text-subtle">
        Tu marcaje queda con la hora y el lugar exactos. No se puede editar ni borrar después,
        tampoco por ti.
      </p>
    </div>
  );
}

/** Se exporta para la planilla, donde tambien se muestran distancias. */
export { prettyDistancia };
