/*
 * Solo notificaciones push. Va aparte de sw.js a proposito: sw.js guarda las
 * pantallas para usar la app sin señal, y eso es solo del plan pago (ver
 * lib/plan.ts). Este no guarda nada: recibe el aviso, lo muestra y, al
 * tocarlo, abre la pantalla que diga el aviso.
 *
 * Se registra con scope "/push/" (ver ActivarNotificaciones.tsx) para no
 * pisar a sw.js, que controla "/".
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Todoen1", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Todoen1";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/panel" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/panel", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // navigate() solo sirve en pestañas que controla este worker, y la app
      // la controla sw.js: si no se puede, se abre la pantalla aparte.
      for (const c of abiertas) {
        if (new URL(c.url).origin !== self.location.origin) continue;
        if (c.url === destino) return c.focus();
        try {
          if ("navigate" in c && (await c.navigate(destino))) return c.focus();
        } catch {
          // Se abre abajo.
        }
        break;
      }
      await self.clients.openWindow(destino);
    })()
  );
});
