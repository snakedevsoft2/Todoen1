import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "ten_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

export type SessionPayload = {
  /** Negocio al que pertenece la sesion. Todos los datos se filtran por aqui. */
  uid: string;
  email: string;
  type: string;
  /** Persona que entro (fila de Staff). Vacio en sesiones viejas: era el dueno. */
  sid?: string;
  /** "DUENO" o "BARBERO". Decide que puede tocar en el panel. */
  role?: string;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "Falta la variable de entorno AUTH_SECRET (minimo 16 caracteres). Definila en .env y en Vercel."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.uid !== "string") return null;
    return {
      uid: payload.uid,
      email: String(payload.email ?? ""),
      type: String(payload.type ?? ""),
      sid: typeof payload.sid === "string" ? payload.sid : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Devuelve el almacen de cookies de la peticion.
 *
 * Importante: hay que pedirlo ANTES de consultar la base de datos. Si se pide
 * despues, Next ya perdio el contexto de la peticion y falla con
 * "cookies was called outside a request scope".
 */
export async function cookieJar() {
  return cookies();
}

type CookieJar = Awaited<ReturnType<typeof cookies>>;

/**
 * Guarda la sesion en una cookie.
 *
 * `remember` no es un adorno: cuando esta apagado la cookie no lleva maxAge,
 * asi que el navegador la borra al cerrarse. Es lo que hay que hacer en un
 * computador prestado o en el del local, donde entra mas de una persona.
 */
export function writeSessionCookie(jar: CookieJar, token: string, remember = true) {
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: MAX_AGE_SECONDS } : {}),
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
