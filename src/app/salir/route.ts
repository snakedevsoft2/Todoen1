import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Borra la cookie y manda al login.
 *
 * Existe por un caso concreto: la cookie sigue siendo valida (esta bien
 * firmada y no ha caducado) pero la sesion ya no sirve, porque la cuenta la
 * suspendieron, al empleado le quitaron el acceso o el negocio se borro.
 *
 * Sin esto se arma un rebote infinito: el panel ve que la sesion no sirve y
 * manda al login, el middleware ve una cookie con firma buena y devuelve al
 * panel, y asi para siempre. Una pagina no puede borrar cookies mientras se
 * pinta, pero una ruta como esta si, y por eso el panel manda aqui en vez de
 * mandar derecho al login.
 */
export async function GET(request: NextRequest) {
  const destino = new URL("/login", request.url);
  destino.searchParams.set("cerrada", "1");

  const respuesta = NextResponse.redirect(destino);
  respuesta.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return respuesta;
}
