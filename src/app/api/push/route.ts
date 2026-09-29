import { getCurrentSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Guarda (POST) o quita (DELETE) el celular donde esta persona activo las
 * notificaciones. Siempre a nombre de la persona de la sesion: el navegador no
 * elige a quien le llegan.
 */
export const dynamic = "force-dynamic";

type Cuerpo = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

function texto(v: unknown, max: number) {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
}

/**
 * Los servicios de push de los navegadores (Chrome/Android/Opera/Samsung,
 * Firefox, Edge, Safari/iPhone). El servidor le hace POST a esta direccion en
 * cada aviso: sin esta lista, cualquiera con sesion podia ponerle una
 * direccion suya y usar el servidor para golpear otros sitios.
 */
const SERVICIOS_PUSH = [".googleapis.com", ".mozilla.com", ".notify.windows.com", ".push.apple.com"];

function endpointValido(endpoint: string) {
  try {
    const u = new URL(endpoint);
    const host = "." + u.hostname;
    return u.protocol === "https:" && SERVICIOS_PUSH.some((s) => host.endsWith(s));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const sesion = await getCurrentSession();
  if (!sesion) return new Response("No autorizado.", { status: 401 });

  let cuerpo: Cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const endpoint = texto(cuerpo.endpoint, 1000);
  const p256dh = texto(cuerpo.keys?.p256dh, 200);
  const auth = texto(cuerpo.keys?.auth, 100);
  if (!endpoint || !p256dh || !auth || !endpointValido(endpoint)) {
    return Response.json({ error: "Suscripción inválida." }, { status: 400 });
  }

  const datos = {
    userId: sesion.user.id,
    staffId: sesion.staff.id,
    p256dh,
    auth,
    userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
  };
  // Si el mismo celular lo usaba otra persona (otra sesion), pasa a esta.
  await db.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, ...datos }, update: datos });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const sesion = await getCurrentSession();
  if (!sesion) return new Response("No autorizado.", { status: 401 });

  let endpoint: string | null = null;
  try {
    endpoint = texto(((await request.json()) as Cuerpo).endpoint, 1000);
  } catch {
    // Sin cuerpo.
  }
  if (endpoint) await db.pushSubscription.deleteMany({ where: { endpoint, staffId: sesion.staff.id } });
  return Response.json({ ok: true });
}
