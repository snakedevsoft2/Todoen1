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
import { Icon } from "./Icon";
import { RegistrarSW } from "./RegistrarSW";

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
 */

type Sitio = { id: string; name: string };

type Estado =
  | { fase: "listo" }
  | { fase: "ubicando" }
  | { fase: "guardado"; kind: "ENTRADA" | "SALIDA"; conUbicacion: boolean };

/**
 * Pide la ubicacion, pero no se queda colgado esperandola.
 *
 * Un GPS en un sotano puede tardar un minuto o no responder nunca. Si a los
 * ocho segundos no llego, se marca igual y sin coordenada: es mejor un marcaje
 * sin ubicacion que una persona esperando con el telefono en la mano.
 */
function ubicar(): Promise<GeolocationPosition | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    let resuelto = false;
    const listo = (p: GeolocationPosition | null) => {
      if (!resuelto) {
        resuelto = true;
        resolve(p);
      }
    };
    navigator.geolocation.getCurrentPosition(
      (p) => listo(p),
      () => listo(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
    setTimeout(() => listo(null), 8500);
  });
}

export function Marcador({
  sitios,
  ultimo,
}: {
  sitios: Sitio[];
  /** Lo ultimo que marco, para saber si le toca entrada o salida. */
  ultimo: "ENTRADA" | "SALIDA" | null;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: "listo" });
  /*
   * Lo ultimo que marco, llevado aqui y no solo leido del servidor.
   *
   * Antes el boton decidia "entrada o salida" solo con lo que trajo la pagina
   * al abrirse. Al marcar entrada, esa cifra no cambiaba, y a los cuatro
   * segundos el boton volvia a decir "Marcar entrada": la persona podia marcar
   * entrada dos veces seguidas. Y sin senal no hay pagina nueva que lo
   * corrija, asi que tiene que resolverse en el telefono.
   */
  const [ultimoLocal, setUltimoLocal] = useState<"ENTRADA" | "SALIDA" | null>(ultimo);
  const [sitioId, setSitioId] = useState<string>(sitios[0]?.id ?? "");
  const [enCola, setEnCola] = useState(0);
  const [enLinea, setEnLinea] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

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
   * error de "sin internet". La aplicacion desaparece de la pantalla justo en
   * el sotano sin cobertura, que es donde mas tiene que aguantar. Por eso se
   * exige las dos cosas: que haya red en este momento y que el envio haya
   * entregado al menos un marcaje. Si no, la pantalla se queda como esta; el
   * boton ya quedo al dia con el estado local.
   */
  const enviarYRefrescar = useCallback(async () => {
    const r = await enviar();
    if (r && r.huboRed && r.enviados > 0 && navigator.onLine) router.refresh();
  }, [enviar, router]);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    void refrescarCola();
    void enviar();

    const volvio = () => {
      setEnLinea(true);
      // Aqui si vale la pena refrescar: vuelve la red y lo que estaba en la
      // cola por fin sale, asi que la lista de hoy tiene que mostrarlo.
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
    setUltimoLocal(kind);
    await refrescarCola();
    // Se intenta enviar ya. La pagina solo se pide de nuevo si el envio
    // entrego algo con red de por medio: ver enviarYRefrescar.
    void enviarYRefrescar();

    setTimeout(() => setEstado({ fase: "listo" }), 4000);
  }

  const siguiente: "ENTRADA" | "SALIDA" = ultimoLocal === "ENTRADA" ? "SALIDA" : "ENTRADA";

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
              ? "Conectado. Todo lo que marques se envía al momento."
              : "Sin señal. Puedes marcar igual: se envía solo cuando vuelva."}
        </span>
      </div>

      {sitios.length > 0 && (
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
          <Icon
            name={siguiente === "ENTRADA" ? "arrowIn" : "arrowOut"}
            className="h-10 w-10"
          />
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
