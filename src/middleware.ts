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
 * Tambien es el unico que escribe la cabecera x-ruta (ver requireSession). La
 * que mande el navegador se borra SIEMPRE, en toda peticion: antes solo se
 * escribia en las navegaciones al panel y en lo demas (las acciones, que son
 * POST, y /api/sin-senal) pasaba la que trajera la peticion. Con eso un
 * lavador podia mandar "x-ruta: /panel/mis-lavados" y ejecutar acciones que
 * no son suyas, como anotar un gasto.
 */
export async function middleware(request: NextRequest) {
  const cabeceras = new Headers(request.headers);
  cabeceras.delete("x-ruta");
  const seguir = () => NextResponse.next({ request: { headers: cabeceras } });

  const { pathname } = request.nextUrl;
  const esPanel = pathname === "/panel" || pathname.startsWith("/panel/");
  const esAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const esIngreso = pathname === "/login" || pathname === "/registro";

  // Solo miramos navegaciones (GET). Un POST es un Server Action y no queremos
  // tocarlo aqui, mas que para quitarle la x-ruta que traiga.
  if (request.method !== "GET" || !(esPanel || esAdmin || esIngreso)) return seguir();

  const logged = await hasValidSession(request);

  // El panel de la plataforma no se puede mirar sin sesion. Quien tiene
  // sesion pero no es administrador lo decide requireAdmin() en el servidor:
  // aqui no se puede saber, porque el middleware no habla con la base.
  if ((esPanel || esAdmin) && !logged) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (esIngreso && logged) {
    const url = request.nextUrl.clone();
    url.pathname = "/panel";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Le pasa la ruta al layout del panel: ahi se decide que puede abrir un
  // empleado del gestor de asistencia o un lavador, y un layout no tiene otra
  // forma de saber en que pagina esta.
  if (esPanel) cabeceras.set("x-ruta", pathname);

  return seguir();
}

export const config = {
  // Todo menos los archivos fijos: la x-ruta de afuera hay que borrarla
  // tambien en /api (ahi esta /api/sin-senal, que ejecuta acciones).
  matcher: ["/((?!_next/static|_next/image|ocr/|pdfjs/|IMG/|LOGO/|sw\\.js|sw-push\\.js|manifest\\.webmanifest|favicon\\.ico|.*\\.png$).*)"],
};
