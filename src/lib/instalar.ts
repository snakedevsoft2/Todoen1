/**
 * Instalar la aplicacion en cualquier celular.
 *
 * Cada navegador lo hace distinto:
 *   - Chrome, Edge y Samsung Internet en Android avisan que se puede instalar
 *     (evento "beforeinstallprompt") y la aplicacion puede abrir la ventana de
 *     instalacion con su propio boton.
 *   - En iPhone y iPad no hay ese aviso: se instala a mano con Compartir y
 *     "Agregar a inicio".
 *   - Firefox y los navegadores de Xiaomi, Huawei u Opera tienen su menu, o no
 *     instalan bien.
 *   - Dentro de WhatsApp, Instagram, Facebook o TikTok el enlace se abre en un
 *     navegador interno que no deja instalar: hay que abrirlo afuera.
 *
 * Aqui se reconoce cual es y se guarda el aviso de instalacion para usarlo
 * cuando la persona toque "Instalar". Corre en el navegador.
 */

export type Dispositivo =
  | "instalada"
  | "android"
  | "samsung"
  | "firefox-android"
  | "android-otro"
  | "ios-safari"
  | "ios-otro"
  | "app-interna"
  | "escritorio";

/**
 * Que celular y navegador es, por el user agent.
 * `tactil`: el iPad nuevo se presenta como un Mac, pero tiene pantalla tactil.
 */
export function detectarDispositivo(ua: string, instalada: boolean, tactil = false): Dispositivo {
  if (instalada) return "instalada";
  const u = ua.toLowerCase();
  if (/fban|fbav|fb_iab|instagram|line\/|musical_ly|bytedancewebview|snapchat|twitter|pinterest|; wv\)|gsa\//.test(u)) {
    return "app-interna";
  }
  const ios = /iphone|ipad|ipod/.test(u) || (u.includes("macintosh") && tactil);
  if (ios) return /crios|fxios|edgios|opios/.test(u) ? "ios-otro" : "ios-safari";
  if (u.includes("android")) {
    if (u.includes("samsungbrowser")) return "samsung";
    if (u.includes("firefox")) return "firefox-android";
    if (/miuibrowser|huaweibrowser|heytapbrowser|ucbrowser|opr\/|yabrowser/.test(u)) return "android-otro";
    return "android";
  }
  return "escritorio";
}

type AvisoInstalacion = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let guardado: AvisoInstalacion | null = null;
let escuchando = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

/** Empieza a escuchar el aviso de instalacion. Se puede llamar muchas veces. */
export function escucharInstalacion(): void {
  if (escuchando || typeof window === "undefined") return;
  escuchando = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Se guarda para abrir la ventana cuando la persona toque "Instalar".
    e.preventDefault();
    guardado = e as AvisoInstalacion;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    guardado = null;
    avisar();
  });
}

export function suscribirInstalacion(f: () => void): () => void {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

/** Si el navegador dejo abrir la ventana de instalacion. */
export function hayAvisoInstalacion(): boolean {
  return guardado !== null;
}

/** Abre la ventana de instalacion del navegador, si la hay. */
export async function pedirInstalacion(): Promise<"aceptada" | "rechazada" | "no-disponible"> {
  const aviso = guardado;
  if (!aviso) return "no-disponible";
  guardado = null;
  avisar();
  try {
    await aviso.prompt();
    const r = await aviso.userChoice;
    return r.outcome === "accepted" ? "aceptada" : "rechazada";
  } catch {
    return "no-disponible";
  }
}
