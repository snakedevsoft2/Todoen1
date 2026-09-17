/**
 * El video de "como usar la aplicacion" que ve un dueño nuevo en Bienvenida.
 *
 * Se configura con la variable de entorno WELCOME_VIDEO_URL, para que se
 * pueda cambiar el enlace (o quitarlo) sin tocar codigo: solo hay que
 * actualizar esa variable en el servidor y volver a desplegar. Mientras no
 * este puesta, la pantalla muestra un aviso de "proximamente" en su lugar.
 *
 * Acepta un enlace de YouTube o de Vimeo (los convierte a su forma para
 * incrustar) o un archivo de video directo (.mp4, .webm...).
 */

export type VideoBienvenida = { tipo: "iframe" | "video"; src: string };

export function welcomeVideoUrl(): string | null {
  const url = (process.env.WELCOME_VIDEO_URL || "").trim();
  return url || null;
}

export function videoEmbed(url: string): VideoBienvenida | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? { tipo: "iframe", src: "https://www.youtube.com/embed/" + id } : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") || (u.pathname.startsWith("/embed/") ? u.pathname.slice(7) : "");
      return id ? { tipo: "iframe", src: "https://www.youtube.com/embed/" + id } : null;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^\d+$/.test(id) ? { tipo: "iframe", src: "https://player.vimeo.com/video/" + id } : null;
    }
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) {
      return { tipo: "video", src: url };
    }
    // Cualquier otro enlace (Loom, un video ya incrustable...) se intenta como iframe tal cual.
    return { tipo: "iframe", src: url };
  } catch {
    return null;
  }
}
