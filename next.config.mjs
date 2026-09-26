import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/** @type {import('next').NextConfig} */

/**
 * Cabeceras de seguridad para todas las paginas.
 *
 * Ninguna cambia como se ve la aplicacion: le dicen al navegador que cosas NO
 * debe dejar hacer. Cada una tapa un ataque concreto.
 */
const CABECERAS = [
  {
    // Que nadie meta la aplicacion dentro de un marco en otra pagina. Sin esto
    // alguien puede poner el panel invisible encima de su pagina y hacer que
    // la persona toque botones creyendo que toca otra cosa (clickjacking).
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Que el navegador respete el tipo que decimos y no lo adivine mirando el
    // contenido. Adivinando es como un archivo inofensivo termina ejecutandose.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Al salir hacia otro sitio, que no le cuente la direccion completa de
    // donde venia. Las direcciones del panel llevan ids de cuentas y de deudas.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Nadie necesita la camara ni la ubicacion desde una pagina incrustada
    // dentro de la nuestra, asi que las dos se permiten solo a nosotros mismos.
    // El escaner de codigo de barras usa la camara y el marcador de asistencia
    // usa la ubicacion.
    //
    // OJO: "geolocation=()" no significa "nadie de afuera": significa NADIE,
    // tampoco la propia aplicacion. Asi estuvo, y cada marcaje llegaba sin
    // coordenada sin que nada avisara. Tiene que ser "(self)", igual que la
    // camara.
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(self), payment=()",
  },
  {
    // Obliga a usar HTTPS durante un ano. Solo tiene efecto en produccion, que
    // es donde hay certificado.
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig = {
  /**
   * La raiz del proyecto, dicha a mano.
   *
   * Hay un package-lock.json suelto en la carpeta del usuario (C:\Users\Luisx),
   * y Next, al ver dos, adivinaba que la raiz era esa y no esta. De ahi salian
   * el aviso de "multiple lockfiles" y, al final de cada compilacion, un
   * ENOENT buscando .next/server/app/_not-found/page.js.nft.json: los archivos
   * de rastreo los escribia en un sitio y los leia en otro. Con la raiz fijada
   * no hay nada que adivinar.
   */
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),

  // Un limite al tamano de lo que se puede mandar: las fotos ya vienen
  // achicadas desde el navegador y las acciones validan el formato aparte.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },

  // No anunciar que corremos Next ni su version.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: CABECERAS }];
  },
};

export default nextConfig;
