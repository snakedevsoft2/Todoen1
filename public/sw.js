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

/**
 * La licencia de este telefono: cuando confirmo por ultima vez que la cuenta
 * sigue activa. Sin senal, lo guardado solo se abre si la confirmo hace menos
 * de MAX_DIAS_SIN_CONEXION dias (igual que lib/pagos.ts). Asi una cuenta
 * suspendida no sigue funcionando indefinidamente sin conexion.
 */
const LICENCIA = "ten-licencia-" + VERSION;
const MAX_DIAS_SIN_CONEXION = 15;
const DIA_MS = 86400000;

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
      const vivas = [ESTATICOS, PAGINAS, ARCHIVOS, LICENCIA];
      for (const k of await caches.keys()) {
        if (k.startsWith("ten-") && !vivas.includes(k)) await caches.delete(k);
      }
      await self.clients.claim();
    })()
  );
});

const CLAVE_LICENCIA = "/__licencia";

async function leerLicencia() {
  try {
    const r = await (await caches.open(LICENCIA)).match(self.location.origin + CLAVE_LICENCIA);
    return r ? await r.json() : null;
  } catch {
    return null;
  }
}

async function guardarLicencia(activa) {
  try {
    const c = await caches.open(LICENCIA);
    await c.put(
      self.location.origin + CLAVE_LICENCIA,
      new Response(JSON.stringify({ activa, verificadoEn: Date.now() }), { headers: { "Content-Type": "application/json" } })
    );
    if (!activa) {
      // Cuenta suspendida o sesion cerrada: lo guardado de esa cuenta no se
      // puede seguir usando sin senal. Las colas de pendientes no se tocan.
      for (const k of await caches.keys()) {
        if (k.startsWith("ten-paginas")) await caches.delete(k);
      }
    }
  } catch {
    // Se intenta en la proxima confirmacion.
  }
}

/** Null si lo guardado se puede usar sin senal; si no, por que no. */
async function motivoDeBloqueo() {
  const l = await leerLicencia();
  if (!l) return "sin-confirmar";
  if (!l.activa) return "inactiva";
  const ahora = Date.now();
  // Un reloj atrasado a proposito no alarga el plazo.
  if (ahora < l.verificadoEn - DIA_MS) return "vencida";
  if (ahora - l.verificadoEn > MAX_DIAS_SIN_CONEXION * DIA_MS) return "vencida";
  return null;
}

function paginaBloqueada(motivo) {
  const texto =
    motivo === "inactiva"
      ? "Tu sesión se cerró o la cuenta está suspendida. Conéctate a internet para volver a entrar."
      : motivo === "vencida"
        ? "Hace más de " + MAX_DIAS_SIN_CONEXION + " días que este teléfono no se conecta. Conéctate a internet para confirmar que tu cuenta sigue activa. Lo que tengas pendiente no se pierde."
        : "Conéctate a internet una vez para confirmar tu cuenta en este teléfono.";
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conéctate a internet</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f7fa;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#111116;padding:24px}
  .caja{max-width:360px;width:100%;text-align:center}
  h1{font-size:22px;margin:16px 0 8px}
  p{color:#6e6e78;font-size:15px;line-height:1.5;margin:0 0 24px}
  button{display:block;width:100%;padding:14px;border-radius:14px;font-size:16px;font-weight:600;border:0;background:#5856d6;color:#fff;cursor:pointer}
</style></head>
<body><div class="caja" data-licencia="${motivo}">
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#5856d6" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
  <h1>Conéctate a internet</h1>
  <p>${texto}</p>
  <button onclick="location.reload()">Reintentar</button>
</div></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

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
    // Mando al ingreso: la sesion ya no vale (cerrada o cuenta suspendida).
    if (r.redirected && /^\/(login|salir)(\/|$)/.test(new URL(r.url).pathname)) {
      await guardarLicencia(false);
      return;
    }
    // Una redireccion (a Marcar para el empleado, a la bienvenida) no se
    // guarda: abrir sin red mostraria otra pantalla con la direccion de esta.
    if (!r.ok || r.redirected || !(r.headers.get("content-type") || "").includes("text/html")) return;
    // El servidor entrego la pantalla con esta sesion: la cuenta esta activa.
    await guardarLicencia(true);
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

  // La respuesta de /api/licencia, que la pantalla pregunta cuando hay senal.
  if (d.tipo === "licencia") {
    event.waitUntil(guardarLicencia(d.activa === true));
  }

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
        // Llegar al ingreso o a salir con senal es que la sesion termino (o la
        // cuenta se suspendio): lo guardado deja de abrirse sin senal. Sin
        // senal no se toca, para no bloquear a quien abre la app sin cobertura.
        if (url.pathname === "/salir" || url.pathname === "/login") guardarLicencia(false);
        if (guardable && r.ok && !r.redirected && (r.headers.get("content-type") || "").includes("text/html")) {
          const copia = r.clone();
          caches.open(PAGINAS).then((c) => c.put(claveDe(url), copia)).catch(() => {});
          recientes.set(claveDe(url), Date.now());
          // El servidor dejo ver la pantalla: la cuenta esta activa.
          guardarLicencia(true);
        } else if (guardable && r.redirected && /\/(login|salir)(\/|$|\?)/.test(new URL(r.url).pathname + "/")) {
          // Mando al ingreso: sesion cerrada o cuenta suspendida.
          guardarLicencia(false);
        }
        return r;
      } catch {
        if (guardable) {
          const motivo = await motivoDeBloqueo();
          if (motivo) return paginaBloqueada(motivo);
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
