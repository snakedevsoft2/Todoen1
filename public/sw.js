/**
 * Trabajador de fondo de Todoen1: la aplicacion sin senal.
 *
 * Lo que guarda y como lo sirve:
 *
 * - Archivos de /_next/static y del lector de texto (/ocr/): primero del
 *   cache. Llevan una huella o la version en la ruta, asi que nunca quedan
 *   viejos.
 * - El logo y las fotos de productos (/logo/, /foto/) con ?v=: igual, primero
 *   del cache. La version cambia cuando cambia la imagen.
 * - Las imagenes y archivos privados (foto de perfil, fotos de reportes y de
 *   novedades, adjuntos, documentos): primero la red y, sin ella, la copia.
 *   Van en un cache aparte que se borra al llegar al ingreso, igual que las
 *   pantallas: llevan datos de la persona.
 * - Las pantallas del panel: primero la red, y si no hay, la copia guardada.
 *   Se guardan al abrirlas y, en segundo plano, todas las del menu (lo pide
 *   PrepararSinConexion). Sin red se ve lo ultimo guardado; lo que necesite
 *   internet lo avisa la pantalla.
 * - Una pantalla que nunca se guardo: un aviso de "sin conexion" con enlaces a
 *   las que si estan guardadas.
 * - Lo que va a /api, las descargas de /panel/exportar y todo lo que no es GET
 *   NUNCA se toca. Un marcaje o un abono servido desde un cache seria un
 *   registro falso.
 * - Las pantallas y archivos guardados se borran al llegar al ingreso
 *   (LoginForm borra todo lo que empieza por "ten-paginas").
 */

const VERSION = "v1";
const ESTATICOS = "ten-estaticos-" + VERSION;
const PAGINAS = "ten-paginas-" + VERSION;
/** Empieza por "ten-paginas" a proposito: el ingreso borra todo lo que empieza asi. */
const ARCHIVOS = "ten-paginas-archivos-" + VERSION;
const MAX_PAGINAS = 150;
const MAX_ARCHIVOS = 300;

/** Las pantallas que se ofrecen en el aviso, con el texto de su enlace. */
const ENLACE = {
  "/panel": "Ir al inicio",
  "/panel/marcar": "Marcar entrada o salida",
  "/panel/ventas": "Registrar una venta",
  "/panel/escaner": "Escanear un documento",
  "/panel/informes": "Hacer un reporte",
  "/panel/novedades": "Avisar una novedad",
  "/panel/cuentas": "Cuentas abiertas",
  "/panel/gastos": "Gastos",
  "/panel/caja": "Cierre de caja",
  "/panel/cartera": "Cartera",
  "/panel/turnos": "Turnos",
  "/panel/inventario": "Inventario",
  "/panel/clientes": "Clientes",
  "/panel/planilla": "Planilla",
};

const PRIVADOS = ["/foto-perfil/", "/foto-reporte/", "/foto-novedad/", "/adjunto-reporte/", "/documento/"];

/** Archivos que no cambian nunca: llevan la version o una huella en la ruta. */
function esArchivoFijo(url) {
  const r = url.pathname;
  if (r.startsWith("/_next/static/") || r.startsWith("/ocr/")) return true;
  return (r.startsWith("/logo/") || r.startsWith("/foto/")) && url.searchParams.has("v");
}

function esArchivoPrivado(url) {
  return PRIVADOS.some((p) => url.pathname.startsWith(p));
}

function esDescarga(url) {
  return url.pathname.startsWith("/panel/exportar") || url.pathname.startsWith("/panel/planilla/exportar");
}

function esPantalla(url) {
  const r = url.pathname;
  return (r === "/panel" || r.startsWith("/panel/")) && !esDescarga(url);
}

function claveDe(url) {
  return url.origin + url.pathname + url.search;
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const vivas = [ESTATICOS, PAGINAS, ARCHIVOS];
      for (const k of await caches.keys()) {
        if (k.startsWith("ten-") && !vivas.includes(k)) await caches.delete(k);
      }
      await self.clients.claim();
    })()
  );
});

/** Borra lo mas viejo cuando se pasa del tope. */
async function recortar(nombre, maximo) {
  const c = await caches.open(nombre);
  const llaves = await c.keys();
  for (const k of llaves.slice(0, Math.max(0, llaves.length - maximo))) await c.delete(k);
}

async function paginaSinConexion() {
  // Solo se ofrecen las pantallas que de verdad quedaron guardadas: un enlace a
  // una que no se abrio nunca con senal llevaria otra vez a este aviso.
  const enlaces = [];
  try {
    const c = await caches.open(PAGINAS);
    for (const ruta of Object.keys(ENLACE)) {
      if (await c.match(self.location.origin + ruta)) enlaces.push(ruta);
    }
  } catch {
    // Sin cache no hay enlaces; queda el boton de reintentar.
  }
  const botones = enlaces
    .map((r, i) => '<a href="' + r + '"' + (i > 0 ? ' class="otro"' : "") + ">" + ENLACE[r] + "</a>")
    .join("");
  const texto = enlaces.length
    ? "Esta pantalla no quedó guardada en este teléfono. Estas sí funcionan sin conexión:"
    : "Esta pantalla necesita señal. Vuelve a intentarlo cuando tengas conexión.";
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f7fa;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#111116;padding:24px}
  .caja{max-width:360px;width:100%;text-align:center}
  h1{font-size:22px;margin:16px 0 8px}
  p{color:#6e6e78;font-size:15px;line-height:1.5;margin:0 0 24px}
  a,button{display:block;width:100%;box-sizing:border-box;padding:14px;border-radius:14px;font-size:16px;
           font-weight:600;text-decoration:none;border:0;margin-bottom:10px;cursor:pointer}
  a{background:#5856d6;color:#fff} a.otro,button{background:#fff;color:#111116;border:1px solid #e6e6eb}
</style></head>
<body><div class="caja">
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9a520a" stroke-width="2"><path d="M12 8v5m0 3h.01M10.3 4.3 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/></svg>
  <h1>Sin conexión</h1>
  <p>${texto}</p>
  ${botones}
  <button onclick="location.reload()">Reintentar</button>
</div></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Las rutas de archivos que aparecen en una pantalla: sus scripts y sus imagenes. */
function archivosDe(html) {
  const encontrados = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) encontrados.add(m[0]);
  for (const m of html.matchAll(/\/(?:logo|foto|foto-perfil|foto-reporte|foto-novedad)\/[^"'\s)\\<]+/g)) {
    encontrados.add(m[0].replace(/&amp;/g, "&"));
  }
  return [...encontrados];
}

async function guardarArchivos(lista) {
  const estaticos = await caches.open(ESTATICOS);
  const privados = await caches.open(ARCHIVOS);
  for (const u of lista.slice(0, 400)) {
    try {
      const url = new URL(u, self.location.origin);
      if (url.origin !== self.location.origin) continue;
      const cache = esArchivoFijo(url) ? estaticos : esArchivoPrivado(url) ? privados : null;
      if (!cache || (await cache.match(url.href))) continue;
      const r = await fetch(url.href, { credentials: "same-origin" });
      if (r.ok) await cache.put(url.href, r);
    } catch {
      // Uno que falle no impide guardar los demas.
    }
  }
  await recortar(ARCHIVOS, MAX_ARCHIVOS);
}

/** Cuando se guardo cada pantalla, para no pedirla dos veces seguidas al servidor. */
const recientes = new Map();

async function guardarPagina(ruta, conArchivos) {
  try {
    const url = new URL(ruta, self.location.origin);
    if (url.origin !== self.location.origin || !esPantalla(url)) return;
    const clave = claveDe(url);
    if (Date.now() - (recientes.get(clave) ?? 0) < 120000) return;
    const r = await fetch(url.href, { credentials: "same-origin" });
    // Una redireccion (al ingreso, o a Marcar para el empleado) no se guarda:
    // abrir sin red mostraria otra pantalla con la direccion de esta.
    if (!r.ok || r.redirected || !(r.headers.get("content-type") || "").includes("text/html")) return;
    recientes.set(clave, Date.now());
    const texto = conArchivos ? await r.clone().text() : null;
    const c = await caches.open(PAGINAS);
    await c.put(clave, r);
    await recortar(PAGINAS, MAX_PAGINAS);
    if (texto) await guardarArchivos(archivosDe(texto));
  } catch {
    // Sin red en este momento: se guarda en la proxima.
  }
}

self.addEventListener("message", (event) => {
  const d = event.data || {};

  // La pantalla que se esta viendo, con los archivos que ya cargo.
  if (d.tipo === "guardar") {
    event.waitUntil(
      (async () => {
        if (typeof d.pagina === "string") await guardarPagina(d.pagina, false);
        if (Array.isArray(d.recursos)) await guardarArchivos(d.recursos);
      })()
    );
  }

  // Todas las pantallas del menu, en segundo plano, con sus scripts e imagenes.
  if (d.tipo === "precargar" && Array.isArray(d.paginas)) {
    event.waitUntil(
      (async () => {
        if (Array.isArray(d.recursos)) await guardarArchivos(d.recursos);
        for (const p of d.paginas.slice(0, 40)) {
          if (typeof p === "string") await guardarPagina(p, true);
        }
      })()
    );
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || esDescarga(url)) return;

  if (esArchivoFijo(url)) {
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

  if (esArchivoPrivado(url)) {
    event.respondWith(
      (async () => {
        try {
          const r = await fetch(req);
          if (r.ok) (await caches.open(ARCHIVOS)).put(req, r.clone());
          return r;
        } catch {
          const guardado = await (await caches.open(ARCHIVOS)).match(req);
          return guardado ?? new Response("", { status: 503 });
        }
      })()
    );
    return;
  }

  // Solo navegaciones. Las peticiones internas de Next (RSC) pasan derecho:
  // si fallan sin red, Next cae a una navegacion, y esa si la atiende esto.
  if (req.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      const guardable = esPantalla(url);
      try {
        const r = await fetch(req);
        if (guardable && r.ok && !r.redirected && (r.headers.get("content-type") || "").includes("text/html")) {
          const copia = r.clone();
          caches.open(PAGINAS).then((c) => c.put(claveDe(url), copia)).catch(() => {});
          recientes.set(claveDe(url), Date.now());
        }
        return r;
      } catch {
        if (guardable) {
          const c = await caches.open(PAGINAS);
          const exacta = await c.match(claveDe(url));
          if (exacta) return exacta;
          // La misma pantalla con otra fecha o filtro: mejor lo ultimo guardado que nada.
          const sinFiltros = await c.match(url.origin + url.pathname);
          if (sinFiltros) return sinFiltros;
        }
        return await paginaSinConexion();
      }
    })()
  );
});
