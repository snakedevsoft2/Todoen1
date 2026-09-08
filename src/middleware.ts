import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "ten_session";

async function hasValidSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

/**
 * Primera barrera: corta las navegaciones al panel sin sesion.
 * La barrera de verdad esta en el servidor. El layout del panel llama a
 * requireUser() y cada accion y cada consulta filtran por el usuario dueno de
 * los datos, asi que un usuario nunca alcanza lo de otro negocio.
 *
 * Solo miramos navegaciones (GET). Un POST es un Server Action y no queremos
 * tocarlo aqui.
 */
export async function middleware(request: NextRequest) {
  if (request.method !== "GET") return NextResponse.next();

  const { pathname } = request.nextUrl;
  const logged = await hasValidSession(request);

  if (pathname.startsWith("/panel") && !logged) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if ((pathname === "/login" || pathname === "/registro") && logged) {
    const url = request.nextUrl.clone();
    url.pathname = "/panel";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/panel/:path*", "/login", "/registro"],
};
