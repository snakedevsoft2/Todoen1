import { estaInstalada } from "./instalar";

/**
 * Los errores que se caen en el telefono, contados al servidor.
 *
 * Sin esto, cuando la aplicacion se cae en el telefono de alguien (como la
 * pantalla blanca de "Application error" que le salio a Fer en el iPhone) no
 * hay forma de saber que paso: el mensaje solo queda en la consola del
 * telefono, que nadie puede abrir. Con esto queda en los registros del
 * servidor (en Vercel: Logs, buscando "error-cliente").
 *
 * Corre en el navegador. Nunca debe fallar: si no se puede avisar, no se avisa.
 */

/**
 * Errores de tener una version vieja de la aplicacion abierta: los archivos de
 * codigo de la version anterior ya no estan despues de publicar una nueva, o
 * una accion del servidor cambio de nombre. Se arreglan solos volviendo a
 * cargar la pantalla.
 */
export function esErrorDeVersion(e: unknown): boolean {
  const texto = e instanceof Error ? e.name + " " + e.message : String(e);
  return /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed|Server Action .*(was not found|not found on the server)|older or newer deployment/i.test(
    texto
  );
}

export function reportarError(e: Error & { digest?: string }, donde: string): void {
  try {
    const cuerpo = JSON.stringify({
      donde,
      nombre: String(e?.name ?? "Error").slice(0, 80),
      mensaje: String(e?.message ?? e).slice(0, 500),
      digest: typeof e?.digest === "string" ? e.digest.slice(0, 80) : null,
      pila: String(e?.stack ?? "").slice(0, 1500),
      ruta: location.pathname,
      instalada: estaInstalada(),
      enLinea: navigator.onLine,
    });
    void fetch("/api/error-cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: cuerpo,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Avisar es lo de menos: la pantalla tiene que salir igual.
  }
}

const CLAVE_RECARGA = "ten_recarga_por_version";

/**
 * Vuelve a cargar la pantalla una sola vez por un error de version. Devuelve
 * si lo hizo. Si ya se recargo hace poco y volvio a fallar, no insiste (seria
 * un ciclo sin fin) y deja la pantalla de error con su boton.
 */
export function recargarSiEsVersion(e: unknown): boolean {
  if (!esErrorDeVersion(e)) return false;
  try {
    const antes = Number(sessionStorage.getItem(CLAVE_RECARGA) ?? 0);
    if (Date.now() - antes < 60_000) return false;
    sessionStorage.setItem(CLAVE_RECARGA, String(Date.now()));
  } catch {
    // Sin donde anotarlo no se arriesga a recargar sin fin.
    return false;
  }
  window.location.reload();
  return true;
}
