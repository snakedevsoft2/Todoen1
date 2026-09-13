/**
 * Trabajador de fondo de Todoen1: abrir el marcador sin senal.
 *
 * La cola de marcajes (src/lib/cola-marcajes.ts) ya guardaba lo marcado sin
 * red, pero solo si la pantalla estaba abierta desde antes. Si el empleado
 * abria la aplicacion en frio dentro del sotano, la pagina no cargaba. Esto
 * guarda la pagina de Marcar y sus archivos para poder abrirla sin red.
 *
 * Lo que hace, y lo que NO hace a proposito:
 *
 * - Archivos de /_next/static: primero del cache. Llevan una huella en el
 *   nombre, asi que un archivo guardado nunca queda viejo.
 * - La pagina de Marcar: primero la red, y si no hay, la copia guardada. Asi
 *   con senal siempre se ve lo ultimo.
 * - Cualquier otra pagina sin red: un aviso de "sin conexion" con el enlace a
 *   Marcar, en vez de la pagina de error del navegador.
 * - Lo que va a /api y todo lo que no es GET NUNCA se toca. Un marcaje o un
 *   abono servido desde un cache seria un registro falso.
 * - Las paginas guardadas se borran al llegar al ingreso (LoginForm): llevan
 *   el nombre de quien estaba adentro.
 */

const VERSION = "v1";
const ESTATICOS = "ten-estaticos-" + VERSION;
const PAGINAS = "ten-paginas-" + VERSION;

/** Las unicas paginas que sirven sin red. */
const PARA_SIN_CONEXION = ["/panel/marcar", "/panel/informes", "/panel/novedades"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const vivas = [ESTATICOS, PAGINAS];
      for (const k of await caches.keys()) {
        if (k.startsWith("ten-") && !vivas.includes(k)) await caches.delete(k);
      }
      await self.clients.claim();
    })()
  );
});

function claveDePagina(ruta) {
  return new URL(ruta, self.location.origin).href;
}

function paginaSinConexion() {
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f7fa;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#111116;padding:24px}
  .caja{max-width:360px;text-align:center}
  h1{font-size:22px;margin:16px 0 8px}
  p{color:#6e6e78;font-size:15px;line-height:1.5;margin:0 0 24px}
  a,button{display:block;width:100%;box-sizing:border-box;padding:14px;border-radius:14px;font-size:16px;
           font-weight:600;text-decoration:none;border:0;margin-bottom:10px;cursor:pointer}
  a{background:#5856d6;color:#fff} button{background:#fff;color:#111116;border:1px solid #e6e6eb}
</style></head>
<body><div class="caja">
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9a520a" stroke-width="2"><path d="M12 8v5m0 3h.01M10.3 4.3 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/></svg>
  <h1>Sin conexión</h1>
  <p>Esta pantalla necesita señal. Para marcar tu entrada o salida no hace falta: el marcaje y los reportes se guardan en el teléfono y se envían solos cuando vuelva la señal.</p>
  <a href="/panel/marcar">Ir a marcar</a>
  <a href="/panel/informes" style="background:#fff;color:#111116;border:1px solid #e6e6eb">Hacer un reporte</a>
  <button onclick="location.reload()">Reintentar</button>
</div></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function guardarPagina(ruta) {
  try {
    const r = await fetch(ruta, { credentials: "same-origin" });
    // Una redireccion (al ingreso, porque la sesion se cayo) no se guarda:
    // abrir sin red mostraria el ingreso en vez de Marcar.
    if (r.ok && !r.redirected) {
      const c = await caches.open(PAGINAS);
      await c.put(claveDePagina(ruta), r);
    }
  } catch {
    // Sin red en este momento: se guarda en la proxima visita.
  }
}

/** La pagina le avisa que se abrio con red y le pasa sus archivos. */
self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.tipo !== "guardar") return;

  event.waitUntil(
    (async () => {
      if (typeof d.pagina === "string" && PARA_SIN_CONEXION.includes(d.pagina)) {
        await guardarPagina(d.pagina);
      }
      if (!Array.isArray(d.recursos)) return;

      const c = await caches.open(ESTATICOS);
      for (const u of d.recursos.slice(0, 300)) {
        try {
          const url = new URL(u, self.location.origin);
          if (url.origin !== self.location.origin) continue;
          if (!url.pathname.startsWith("/_next/static/")) continue;
          if (await c.match(url.href)) continue;
          const r = await fetch(url.href, { credentials: "same-origin" });
          if (r.ok) await c.put(url.href, r);
        } catch {
          // Uno que falle no impide guardar los demas.
        }
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const c = await caches.open(ESTATICOS);
        const guardado = await c.match(req);
        if (guardado) return guardado;
        const r = await fetch(req);
        if (r.ok) c.put(req, r.clone());
        return r;
      })()
    );
    return;
  }

  // Solo navegaciones. Las peticiones internas de Next (RSC) pasan derecho:
  // si fallan sin red, Next cae a una navegacion, y esa si la atiende esto.
  if (req.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      const guardable = PARA_SIN_CONEXION.includes(url.pathname);
      const clave = claveDePagina(url.pathname);
      try {
        const r = await fetch(req);
        if (guardable && r.ok && !r.redirected) {
          const c = await caches.open(PAGINAS);
          c.put(clave, r.clone());
        }
        return r;
      } catch {
        if (guardable) {
          const c = await caches.open(PAGINAS);
          const guardada = await c.match(clave);
          if (guardada) return guardada;
        }
        return paginaSinConexion();
      }
    })()
  );
});
