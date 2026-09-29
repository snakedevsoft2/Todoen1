"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * Activar las notificaciones push en este celular.
 *
 * Registra public/sw-push.js con scope "/push/" (no pisa a sw.js, que es el
 * del modo sin señal y solo del plan pago), pide permiso, se suscribe y le
 * manda la suscripcion al servidor, que la guarda a nombre de quien tiene la
 * sesion (ver api/push).
 *
 * En iPhone solo existe si la app esta instalada en la pantalla de inicio
 * (iOS 16.4+). Donde no se puede, el componente no se muestra.
 *
 * Dos formas: "aviso" (la franja de arriba del panel, que se puede cerrar) y
 * "tarjeta" (en Mi perfil, para activar o apagar cuando quiera).
 */

const CLAVE_OCULTO = "todoen1_push_aviso_oculto";
const SCOPE = "/push/";

type Estado = "cargando" | "no-soportado" | "denegado" | "apagado" | "activo" | "activando";

function claveAplicacion(base64: string): Uint8Array {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registro() {
  return (
    (await navigator.serviceWorker.getRegistration(SCOPE)) ??
    (await navigator.serviceWorker.register("/sw-push.js", { scope: SCOPE }))
  );
}

export function ActivarNotificaciones({
  variante,
  queRecibe,
}: {
  variante: "aviso" | "tarjeta";
  /** Lo que le va a llegar a esta persona, dicho corto. */
  queRecibe: string;
}) {
  const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [estado, setEstado] = useState<Estado>("cargando");
  const [oculto, setOculto] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const hasta = Number(localStorage.getItem(CLAVE_OCULTO) ?? 0);
      setOculto(hasta > Date.now());
    } catch {
      setOculto(false);
    }

    if (!clave || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setEstado("no-soportado");
      return;
    }
    if (Notification.permission === "denied") {
      setEstado("denegado");
      return;
    }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration(SCOPE);
        const sub = await reg?.pushManager.getSubscription();
        if (sub && Notification.permission === "granted") {
          // Se vuelve a mandar por si el servidor la borro o cambio de persona.
          await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
          setEstado("activo");
        } else {
          setEstado("apagado");
        }
      } catch {
        setEstado("apagado");
      }
    })();
  }, [clave]);

  const activar = useCallback(async () => {
    if (!clave) return;
    setError(null);
    setEstado("activando");
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "denegado" : "apagado");
        return;
      }
      const reg = await registro();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: claveAplicacion(clave) as BufferSource,
        }));
      const r = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!r.ok) throw new Error("servidor");
      setEstado("activo");
    } catch {
      setError("No se pudieron activar. Revisa tu conexión e inténtalo otra vez.");
      setEstado("apagado");
    }
  }, [clave]);

  const apagar = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration(SCOPE);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } finally {
      setEstado("apagado");
    }
  }, []);

  const ocultar = () => {
    setOculto(true);
    try {
      localStorage.setItem(CLAVE_OCULTO, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch {
      // Sin almacenamiento se vuelve a mostrar la proxima vez; no pasa nada.
    }
  };

  if (variante === "aviso") {
    if (oculto || (estado !== "apagado" && estado !== "activando")) return null;
    return (
      <div
        data-activar-notificaciones
        className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon name="bell" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-strong">Activa las notificaciones</span>
          <span className="block text-xs text-muted">{queRecibe}</span>
          {error && <span className="block text-xs text-bad">{error}</span>}
        </span>
        <button type="button" className="btn-primary btn-sm" onClick={activar} disabled={estado === "activando"}>
          {estado === "activando" ? "Activando..." : "Activar"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={ocultar}>
          Ahora no
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm" data-notificaciones-perfil>
      <p className="text-muted">{queRecibe}</p>
      {estado === "no-soportado" && (
        <p className="text-muted">
          Este navegador no recibe notificaciones. En iPhone primero instala la app en la pantalla de inicio.
        </p>
      )}
      {estado === "denegado" && (
        <p className="text-bad">
          Bloqueaste las notificaciones para esta página. Actívalas en los ajustes del navegador (el candado junto a
          la dirección) y vuelve a entrar.
        </p>
      )}
      {estado === "activo" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-good">Activas en este celular.</span>
          <button type="button" className="btn-ghost btn-sm" onClick={apagar}>
            Apagar
          </button>
        </div>
      )}
      {(estado === "apagado" || estado === "activando") && (
        <button type="button" className="btn-primary btn-sm" onClick={activar} disabled={estado === "activando"}>
          <Icon name="bell" className="h-4 w-4" />
          {estado === "activando" ? "Activando..." : "Activar notificaciones"}
        </button>
      )}
      {error && <p className="text-bad">{error}</p>}
    </div>
  );
}
