import { exchangeCode, facebookEnabled, FACEBOOK_STATE_COOKIE } from "@/lib/facebook";
import { decidirIngreso, leerCookie, responderIngreso, volverConError } from "@/lib/ingreso-social";

export const dynamic = "force-dynamic";

/**
 * Vuelta de Facebook.
 *
 * Mismas reglas que Google: lo decide lib/ingreso-social.ts.
 */
export async function GET(request: Request) {
  if (!facebookEnabled()) return volverConError(request, "facebook", FACEBOOK_STATE_COOKIE);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (url.searchParams.get("error") || !code) {
    return volverConError(request, "cancelado", FACEBOOK_STATE_COOKIE);
  }

  const cookieState = leerCookie(request, FACEBOOK_STATE_COOKIE);
  if (!state || !cookieState || state !== cookieState) {
    return volverConError(request, "state", FACEBOOK_STATE_COOKIE);
  }

  const perfil = await exchangeCode(code, url.origin);
  if (!perfil) return volverConError(request, "facebook", FACEBOOK_STATE_COOKIE);

  // Cuenta de Facebook abierta solo con telefono: no hay correo con que
  // buscar su negocio.
  if (!perfil.email) return volverConError(request, "sincorreo", FACEBOOK_STATE_COOKIE);

  const decision = await decidirIngreso(perfil.email, perfil.name);
  return responderIngreso(request, decision, "facebook", FACEBOOK_STATE_COOKIE);
}
