import { NextResponse } from "next/server";
import { authorizeUrl, googleEnabled, GOOGLE_STATE_COOKIE } from "@/lib/google";

export const dynamic = "force-dynamic";

/** Arranca el ingreso con Google. */
export async function GET(request: Request) {
  if (!googleEnabled()) {
    return NextResponse.redirect(new URL("/login?error=google", request.url));
  }

  const origin = new URL(request.url).origin;
  // Valor al azar que viaja a Google y vuelve: si no coincide con la cookie,
  // el ingreso no lo empezamos nosotros y no lo aceptamos.
  const state = crypto.randomUUID();

  const response = NextResponse.redirect(authorizeUrl(origin, state));
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
