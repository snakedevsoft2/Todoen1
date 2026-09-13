"use client";

import { useActionState, useState } from "react";
import { guardarSitioAction } from "@/actions/asistencia";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

/**
 * Alta de un sitio de trabajo.
 *
 * La coordenada se toma del propio telefono estando parado en el sitio, que es
 * mucho mas exacto que buscar la direccion en un mapa y mucho mas rapido que
 * escribir numeros a mano. Igual se puede dejar sin ubicacion: un sitio sin
 * coordenada sigue sirviendo para agrupar.
 */
export function SitioForm() {
  const [state, formAction] = useActionState(guardarSitioAction, undefined);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [precision, setPrecision] = useState<number | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorGps, setErrorGps] = useState<string | null>(null);

  function usarMiUbicacion() {
    setErrorGps(null);
    if (!("geolocation" in navigator)) {
      setErrorGps("Este dispositivo no da ubicación.");
      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
        setPrecision(Math.round(p.coords.accuracy));
        setBuscando(false);
      },
      (e) => {
        setBuscando(false);
        setErrorGps(
          e.code === e.PERMISSION_DENIED
            ? "Diste No al permiso de ubicación. Actívalo para el navegador y vuelve a intentar."
            : "No se pudo tomar la ubicación. Sal a un sitio despejado y reintenta."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <Field label="Nombre del sitio">
        <input className="input" name="name" required placeholder="Ej: Sede Norte" />
      </Field>

      <Field label="Dirección (opcional)">
        <input className="input" name="address" placeholder="Ej: Calle 80 #12-30" />
      </Field>

      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />

      <div className="rounded-xl border border-line bg-surface p-3">
        <button
          type="button"
          onClick={usarMiUbicacion}
          disabled={buscando}
          className="btn-ghost btn-sm w-full"
        >
          <Icon name="map" className="h-4 w-4" />
          {buscando ? "Tomando ubicación…" : lat ? "Volver a tomar" : "Usar mi ubicación"}
        </button>

        {lat && (
          <p className="mt-2 text-[11px] text-good">
            Ubicación guardada: {lat}, {lng}
            {precision !== null && " · precisión ±" + precision + " m"}
          </p>
        )}
        {errorGps && <p className="mt-2 text-[11px] text-bad">{errorGps}</p>}
        {!lat && !errorGps && (
          <p className="mt-2 text-[11px] text-muted">
            Sin ubicación el sitio sirve igual, pero no se puede medir a qué distancia marcó cada
            quien.
          </p>
        )}
      </div>

      <Field
        label="Radio en metros"
        hint="Dentro de este radio cuenta como marcado en el sitio. 150 va bien para un edificio."
      >
        <input
          className="input"
          type="number"
          name="radiusM"
          min={30}
          max={5000}
          step={10}
          defaultValue={150}
        />
      </Field>

      <SubmitButton className="btn-primary w-full" pendingText="Guardando...">
        <Icon name="plus" className="h-4 w-4" />
        Agregar sitio
      </SubmitButton>
    </form>
  );
}
