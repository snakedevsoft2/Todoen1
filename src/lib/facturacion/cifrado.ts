import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Cifrado de las credenciales del proveedor de facturacion de cada negocio.
 *
 * Con esas credenciales se emiten facturas a nombre del negocio ante la DIAN o
 * el SRI, asi que no pueden quedar legibles en la base de datos: si alguien
 * llegara a ver una copia de la base, no le sirven sin la llave.
 *
 * La llave sale de FACTURACION_SECRET, o si no esta, de AUTH_SECRET. Cambiarla
 * deja las credenciales guardadas sin poder leerse: el negocio tendria que
 * volver a escribirlas.
 */

const VERSION = "v1";

function llave(): Buffer {
  const base = process.env.FACTURACION_SECRET || process.env.AUTH_SECRET;
  if (!base || base.length < 16) {
    throw new Error("Falta FACTURACION_SECRET o AUTH_SECRET para proteger las credenciales de facturación.");
  }
  // Una llave derivada y no el secreto mismo: la sesion y la facturacion no
  // comparten llave aunque salgan del mismo secreto.
  return Buffer.from(hkdfSync("sha256", base, "todoen1", "facturacion-credenciales", 32));
}

export function cifrar(datos: Record<string, string>): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", llave(), iv);
  const cuerpo = Buffer.concat([cifrador.update(JSON.stringify(datos), "utf8"), cifrador.final()]);
  const sello = cifrador.getAuthTag();
  return VERSION + ":" + Buffer.concat([iv, sello, cuerpo]).toString("base64");
}

/** Devuelve null si no se puede leer (llave cambiada o dato alterado). */
export function descifrar(texto: string | null | undefined): Record<string, string> | null {
  if (!texto || !texto.startsWith(VERSION + ":")) return null;
  try {
    const crudo = Buffer.from(texto.slice(VERSION.length + 1), "base64");
    const descifrador = createDecipheriv("aes-256-gcm", llave(), crudo.subarray(0, 12));
    descifrador.setAuthTag(crudo.subarray(12, 28));
    const plano = Buffer.concat([descifrador.update(crudo.subarray(28)), descifrador.final()]).toString("utf8");
    const datos = JSON.parse(plano);
    return datos && typeof datos === "object" ? (datos as Record<string, string>) : null;
  } catch {
    return null;
  }
}
