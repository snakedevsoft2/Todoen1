import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureOwnerStaff } from "@/lib/auth";
import { exchangeCode, googleEnabled, GOOGLE_STATE_COOKIE } from "@/lib/google";
import { signSession, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function volverConError(request: Request, motivo: string) {
  return NextResponse.redirect(new URL("/login?error=" + motivo, request.url));
}

/**
 * Vuelta de Google.
 *
 * Buscamos el correo entre los duenos y entre los empleados: quien entra con
 * Google entra al mismo sitio que entraria con su contrasena, con los mismos
 * permisos. Si el correo no esta en ningun negocio lo mandamos a crear la
 * cuenta, porque para abrir un negocio hacen falta datos que Google no da
 * (el nombre del negocio y de que tipo es).
 */
export async function GET(request: Request) {
  if (!googleEnabled()) return volverConError(request, "google");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (url.searchParams.get("error") || !code) {
    return volverConError(request, "cancelado");
  }

  // El state tiene que ser el mismo que guardamos al arrancar.
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(GOOGLE_STATE_COOKIE + "="))
    ?.slice(GOOGLE_STATE_COOKIE.length + 1);

  if (!state || !cookieState || state !== cookieState) {
    return volverConError(request, "state");
  }

  const perfil = await exchangeCode(code, url.origin);
  if (!perfil) return volverConError(request, "google");

  // Un correo sin verificar no prueba nada: cualquiera pudo ponerlo.
  if (!perfil.emailVerified) return volverConError(request, "sinverificar");

  // 1. El dueno del negocio.
  const owner = await db.user.findUnique({ where: { email: perfil.email } });
  if (owner) {
    const staff = await ensureOwnerStaff(owner);
    const token = await signSession({
      uid: owner.id,
      email: owner.email,
      type: owner.businessType,
      sid: staff.id,
      role: staff.role,
    });
    return responderConSesion(request, token, "/panel");
  }

  // 2. Un empleado con usuario propio dentro de un negocio.
  const staff = await db.staff.findUnique({
    where: { email: perfil.email },
    include: { user: true },
  });

  if (staff && staff.active) {
    const token = await signSession({
      uid: staff.userId,
      email: perfil.email,
      type: staff.user.businessType,
      sid: staff.id,
      role: staff.role,
    });
    return responderConSesion(request, token, "/panel");
  }

  if (staff && !staff.active) return volverConError(request, "desactivado");

  // 3. No tiene cuenta: lo mandamos a crearla con el correo ya puesto.
  const destino = new URL("/registro", request.url);
  destino.searchParams.set("email", perfil.email);
  if (perfil.name) destino.searchParams.set("nombre", perfil.name);
  destino.searchParams.set("google", "1");
  return limpiarState(NextResponse.redirect(destino));
}

function responderConSesion(request: Request, token: string, destino: string) {
  const response = NextResponse.redirect(new URL(destino, request.url));
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return limpiarState(response);
}

function limpiarState(response: NextResponse) {
  response.cookies.set(GOOGLE_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
