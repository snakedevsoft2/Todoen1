import "server-only";
import { NextResponse } from "next/server";

/**
 * Devuelve una imagen guardada como data URL, sin que pueda ejecutar nada.
 *
 * Las fotos y los logos viven en la base como data URL. Servirlos parece
 * inofensivo, pero tiene una trampa: si lo que hay guardado no es una imagen
 * de verdad sino un SVG con JavaScript dentro, y lo devolvemos con su propio
 * tipo, entonces abrir esa direccion ejecuta ese codigo *dentro de nuestro
 * dominio*, con la sesion de quien la abra. Como la direccion del logo se
 * arma con el slug del negocio, que es publico, bastaria con mandarle el
 * enlace a alguien.
 *
 * Por eso aqui no nos fiamos de lo que diga el data URL:
 *
 *   1. Solo se sirven cuatro tipos, y son todos formatos que el navegador
 *      pinta pero no ejecuta. Cualquier otro se responde 404.
 *   2. nosniff, para que el navegador no adivine el tipo por su cuenta.
 *   3. Una politica que prohibe todo (scripts, marcos, peticiones), por si
 *      algun dia se cuela un formato que si pueda ejecutar.
 *
 * Son tres candados para la misma puerta. El primero deberia bastar; los otros
 * dos estan por si el primero falla.
 */
const TIPOS_SEGUROS = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

export function servirImagen(dataUrl: string | null | undefined): NextResponse {
  if (!dataUrl) return new NextResponse("Sin imagen", { status: 404 });

  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return new NextResponse("Imagen invalida", { status: 404 });

  const [, mime, base64] = match;
  if (!TIPOS_SEGUROS.has(mime.toLowerCase())) {
    return new NextResponse("Formato no permitido", { status: 404 });
  }

  const bytes = Buffer.from(base64, "base64");

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // La direccion lleva la version, asi que se puede cachear fuerte.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
