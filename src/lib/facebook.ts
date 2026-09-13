import { createHmac } from "node:crypto";

/**
 * Ingreso con Facebook.
 *
 * Hecho a mano contra el protocolo, igual que Google (lib/google.ts): la
 * aplicacion ya tiene su propia sesion y una libreria de autenticacion
 * querria mandar en ella. Son dos peticiones.
 *
 * Para que funcione hay que crear una app en Meta para Desarrolladores, con el
 * producto "Inicio de sesion con Facebook", y poner FACEBOOK_APP_ID y
 * FACEBOOK_APP_SECRET. Sin eso, el boton no aparece.
 *
 * Sobre el correo: Facebook solo entrega correos que la persona confirmo, asi
 * que el que llega sirve para identificarla igual que el de Google. Hay
 * cuentas de Facebook abiertas solo con telefono que no tienen correo: a esas
 * no se las deja entrar, porque no hay con que buscar su negocio.
 */

export const FACEBOOK_STATE_COOKIE = "ten_facebook_state";

const VERSION = "v19.0";
const DIALOGO = "https://www.facebook.com/" + VERSION + "/dialog/oauth";
const GRAPH = "https://graph.facebook.com/" + VERSION;

export function facebookEnabled(): boolean {
  return Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

export function callbackUrl(origin: string): string {
  return origin + "/auth/facebook/callback";
}

export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID ?? "",
    redirect_uri: callbackUrl(origin),
    state,
    response_type: "code",
    scope: "email,public_profile",
  });
  return DIALOGO + "?" + params.toString();
}

export type FacebookUser = { id: string; email: string | null; name: string };

/** Cambia el codigo por el token y pide el perfil. */
export async function exchangeCode(code: string, origin: string): Promise<FacebookUser | null> {
  const appId = process.env.FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !secret) return null;

  try {
    const token = await fetch(
      GRAPH +
        "/oauth/access_token?" +
        new URLSearchParams({
          client_id: appId,
          client_secret: secret,
          redirect_uri: callbackUrl(origin),
          code,
        }),
      { cache: "no-store" }
    );
    if (!token.ok) return null;
    const { access_token } = (await token.json()) as { access_token?: string };
    if (!access_token) return null;

    // La prueba de secreto amarra la consulta a nuestra app: sin ella, un
    // token robado de otra aplicacion serviria para consultar el perfil.
    const prueba = createHmac("sha256", secret).update(access_token).digest("hex");

    const me = await fetch(
      GRAPH +
        "/me?" +
        new URLSearchParams({ fields: "id,name,email", access_token, appsecret_proof: prueba }),
      { cache: "no-store" }
    );
    if (!me.ok) return null;
    const perfil = (await me.json()) as { id?: string; name?: string; email?: string };
    if (!perfil.id) return null;

    return {
      id: perfil.id,
      name: String(perfil.name ?? "").trim(),
      email: perfil.email ? perfil.email.trim().toLowerCase() : null,
    };
  } catch {
    return null;
  }
}
