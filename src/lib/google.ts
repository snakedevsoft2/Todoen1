import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Ingreso con Google.
 *
 * Lo hacemos a mano contra el protocolo de Google en vez de meter una libreria
 * de autenticacion completa: la aplicacion ya tiene su propia sesion (cookie
 * firmada + User y Staff), y una libreria de esas querria mandar en todo eso.
 * Son unas pocas peticiones y asi la sesion sigue siendo una sola.
 *
 * Para que funcione hay que crear un cliente OAuth en Google Cloud y poner
 * GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET. Sin eso, el boton no aparece.
 */
/** Cookie donde guardamos el state mientras la persona esta en Google. */
export const GOOGLE_STATE_COOKIE = "ten_google_state";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function googleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** A donde vuelve Google despues de que la persona acepta. */
export function callbackUrl(origin: string): string {
  return origin + "/auth/google/callback";
}

/**
 * Direccion a la que mandamos a la persona.
 *
 * El `state` viaja de ida y vuelta y lo comparamos contra la cookie: es lo que
 * evita que alguien nos meta un ingreso desde otra pagina.
 */
export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return AUTH_ENDPOINT + "?" + params.toString();
}

export type GoogleUser = {
  email: string;
  name: string;
  emailVerified: boolean;
  sub: string;
};

/** Cambia el codigo por el id_token y lo verifica contra las llaves de Google. */
export async function exchangeCode(code: string, origin: string): Promise<GoogleUser | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl(origin),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { id_token?: string };
  if (!data.id_token) return null;

  try {
    // Verificamos la firma con las llaves publicas de Google y que el token
    // sea para nuestra aplicacion: sin esto cualquiera podria fabricar uno.
    const { payload } = await jwtVerify(data.id_token, jwks, {
      issuer: ISSUERS,
      audience: clientId,
    });

    const email = String(payload.email ?? "").trim().toLowerCase();
    if (!email) return null;

    return {
      email,
      name: String(payload.name ?? "").trim(),
      emailVerified: payload.email_verified === true,
      sub: String(payload.sub ?? ""),
    };
  } catch {
    return null;
  }
}
