import { NextResponse } from "next/server";
import { authorizeUrl, facebookEnabled, FACEBOOK_STATE_COOKIE } from "@/lib/facebook";
import { ponerState } from "@/lib/ingreso-social";

export const dynamic = "force-dynamic";

/** Arranca el ingreso con Facebook. */
export async function GET(request: Request) {
  if (!facebookEnabled()) {
    return NextResponse.redirect(new URL("/login?error=facebook", request.url));
  }

  const origin = new URL(request.url).origin;
  // Valor al azar que viaja a Facebook y vuelve: si no coincide con la
  // cookie, el ingreso no lo empezamos nosotros y no lo aceptamos.
  const state = crypto.randomUUID();

  return ponerState(NextResponse.redirect(authorizeUrl(origin, state)), FACEBOOK_STATE_COOKIE, state);
}
