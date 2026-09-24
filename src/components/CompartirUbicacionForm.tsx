"use client";

import { useActionState, useState } from "react";
import {
  compartirUbicacionDeudorAction,
  dejarDeCompartirDeudorAction,
} from "@/actions/ubicacion-deudor";
import { Alert } from "./ui";
import { Icon } from "./Icon";

/**
 * El botón que el deudor toca para compartir su ubicación, o para dejar de
 * hacerlo. Siempre a propósito, siempre desde esta misma pantalla, nunca en
 * segundo plano: el navegador solo puede leer la ubicación mientras esta
 * página está abierta, así que no hay forma de que esto siga funcionando si
 * la persona la cierra.
 */
export function CompartirUbicacionForm({
  debtId,
  yaComparte,
}: {
  debtId: string;
  yaComparte: boolean;
}) {
  const [compartirState, compartirAction, compartiendo] = useActionState(
    compartirUbicacionDeudorAction,
    undefined
  );
  const [dejarState, dejarAction, dejando] = useActionState(dejarDeCompartirDeudorAction, undefined);
  const [errorGeo, setErrorGeo] = useState("");

  function compartirAhora() {
    setErrorGeo("");
    if (!("geolocation" in navigator)) {
      setErrorGeo("Este navegador no puede compartir tu ubicación.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fd = new FormData();
        fd.set("debtId", debtId);
        fd.set("lat", String(pos.coords.latitude));
        fd.set("lng", String(pos.coords.longitude));
        compartirAction(fd);
      },
      (err) => {
        setErrorGeo(
          err.code === err.PERMISSION_DENIED
            ? "No diste permiso para ver tu ubicación. Si quieres compartirla, acéptalo cuando el navegador te lo pida."
            : "No pudimos obtener tu ubicación. Intenta de nuevo."
        );
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function dejarDeCompartir() {
    const fd = new FormData();
    fd.set("debtId", debtId);
    dejarAction(fd);
  }

  return (
    <div className="space-y-3">
      {compartirState?.ok && <Alert kind="ok">{compartirState.ok}</Alert>}
      {compartirState?.error && <Alert kind="error">{compartirState.error}</Alert>}
      {dejarState?.ok && <Alert kind="ok">{dejarState.ok}</Alert>}
      {dejarState?.error && <Alert kind="error">{dejarState.error}</Alert>}
      {errorGeo && <Alert kind="error">{errorGeo}</Alert>}

      <button
        type="button"
        onClick={compartirAhora}
        disabled={compartiendo}
        className="btn-primary w-full justify-center"
      >
        <Icon name="link" className="h-5 w-5" />
        {compartiendo ? "Compartiendo..." : "Compartir mi ubicación ahora"}
      </button>

      {yaComparte && (
        <button
          type="button"
          onClick={dejarDeCompartir}
          disabled={dejando}
          className="btn-ghost w-full justify-center text-bad"
        >
          {dejando ? "..." : "Dejar de compartir"}
        </button>
      )}
    </div>
  );
}
