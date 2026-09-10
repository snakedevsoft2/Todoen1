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
    // Nadie necesita la camara ni el microfono ni la ubicacion desde una
    // pagina que este dentro de la nuestra. El escaner de codigo de barras usa
    // la camara, asi que esa se permite pero solo a nosotros mismos.
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
  {
    // Obliga a usar HTTPS durante un ano. Solo tiene efecto en produccion, que
    // es donde hay certificado.
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig = {
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
