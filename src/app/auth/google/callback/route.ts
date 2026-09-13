import { exchangeCode, googleEnabled, GOOGLE_STATE_COOKIE } from "@/lib/google";
import { decidirIngreso, leerCookie, responderIngreso, volverConError } from "@/lib/ingreso-social";

export const dynamic = "force-dynamic";

/**
 * Vuelta de Google.
 *
 * Quien entra con Google entra al mismo sitio que entraria con su contrasena,
 * con los mismos permisos. Que hacer con el correo lo decide
 * lib/ingreso-social.ts, el mismo que usa Facebook, para que los dos
 * proveedores no puedan decidir distinto.
 */
export async function GET(request: Request) {
  if (!googleEnabled()) return volverConError(request, "google", GOOGLE_STATE_COOKIE);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (url.searchParams.get("error") || !code) {
    return volverConError(request, "cancelado", GOOGLE_STATE_COOKIE);
  }

  // El state tiene que ser el mismo que guardamos al arrancar.
  const cookieState = leerCookie(request, GOOGLE_STATE_COOKIE);
  if (!state || !cookieState || state !== cookieState) {
    return volverConError(request, "state", GOOGLE_STATE_COOKIE);
  }

  const perfil = await exchangeCode(code, url.origin);
  if (!perfil) return volverConError(request, "google", GOOGLE_STATE_COOKIE);

  // Un correo sin verificar no prueba nada: cualquiera pudo ponerlo.
  if (!perfil.emailVerified) return volverConError(request, "sinverificar", GOOGLE_STATE_COOKIE);

  const decision = await decidirIngreso(perfil.email, perfil.name);
  return responderIngreso(request, decision, "google", GOOGLE_STATE_COOKIE);
}
