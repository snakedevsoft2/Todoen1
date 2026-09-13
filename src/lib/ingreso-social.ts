import { NextResponse } from "next/server";
import { db } from "./db";
import { ensureOwnerStaff } from "./auth";
import { signSession, SESSION_COOKIE } from "./session";

/**
 * Que pasa cuando alguien vuelve de Google o de Facebook con un correo.
 *
 * Esta en un solo sitio para que los dos proveedores decidan exactamente
 * igual. Si cada uno tuviera su copia, tarde o temprano uno dejaria entrar a
 * quien el otro no.
 *
 *   1. El correo es de un dueno: entra a su negocio.
 *   2. Es de un empleado activo: entra con sus permisos.
 *   3. Es de un empleado desactivado, o la cuenta esta suspendida: no entra, y
 *      se le dice por que.
 *   4. No es de nadie: va a crear la cuenta con el correo ya puesto.
 */

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type Proveedor = "google" | "facebook";

export type Decision =
  | { tipo: "sesion"; token: string }
  | { tipo: "registro"; email: string; nombre: string }
  | { tipo: "error"; motivo: "desactivado" | "suspendida" };

export async function decidirIngreso(emailCrudo: string, nombre: string): Promise<Decision> {
  const email = emailCrudo.trim().toLowerCase();

  const owner = await db.user.findUnique({ where: { email } });
  if (owner) {
    // Antes Google le daba la cookie a una cuenta suspendida y el panel la
    // echaba despues. Ahora no se le da, y la pantalla dice por que.
    if (owner.suspendedAt) return { tipo: "error", motivo: "suspendida" };
    const staff = await ensureOwnerStaff(owner);
    return {
      tipo: "sesion",
      token: await signSession({
        uid: owner.id,
        email: owner.email,
        type: owner.businessType,
        sid: staff.id,
        role: staff.role,
      }),
    };
  }

  const staff = await db.staff.findUnique({ where: { email }, include: { user: true } });
  if (staff) {
    if (!staff.active) return { tipo: "error", motivo: "desactivado" };
    if (staff.user.suspendedAt) return { tipo: "error", motivo: "suspendida" };
    return {
      tipo: "sesion",
      token: await signSession({
        uid: staff.userId,
        email,
        type: staff.user.businessType,
        sid: staff.id,
        role: staff.role,
      }),
    };
  }

  return { tipo: "registro", email, nombre };
}

export function responderIngreso(
  request: Request,
  decision: Decision,
  proveedor: Proveedor,
  cookieState: string
): NextResponse {
  let respuesta: NextResponse;

  if (decision.tipo === "sesion") {
    respuesta = NextResponse.redirect(new URL("/panel", request.url));
    respuesta.cookies.set(SESSION_COOKIE, decision.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  } else if (decision.tipo === "registro") {
    const destino = new URL("/registro", request.url);
    destino.searchParams.set("email", decision.email);
    if (decision.nombre) destino.searchParams.set("nombre", decision.nombre);
    destino.searchParams.set(proveedor, "1");
    respuesta = NextResponse.redirect(destino);
  } else {
    respuesta = NextResponse.redirect(new URL("/login?error=" + decision.motivo, request.url));
  }

  return limpiarState(respuesta, cookieState);
}

export function volverConError(request: Request, motivo: string, cookieState: string): NextResponse {
  return limpiarState(NextResponse.redirect(new URL("/login?error=" + motivo, request.url)), cookieState);
}

export function limpiarState(respuesta: NextResponse, cookieState: string): NextResponse {
  respuesta.cookies.set(cookieState, "", { path: "/", maxAge: 0 });
  return respuesta;
}

/** Lee una cookie de la peticion sin depender de next/headers. */
export function leerCookie(request: Request, nombre: string): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(nombre + "="))
    ?.slice(nombre.length + 1);
}

/** Guarda el state al arrancar; a la vuelta se compara con el que trae el proveedor. */
export function ponerState(respuesta: NextResponse, cookieState: string, state: string): NextResponse {
  respuesta.cookies.set(cookieState, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return respuesta;
}
