import { getCurrentSession } from "@/lib/auth";
import { MAX_ACCIONES, ejecutarAcciones } from "@/lib/sin-senal/ejecutar";
import { ACCIONES_SIN_SENAL } from "@/lib/sin-senal/registro";

/**
 * Recibe las acciones del panel que se hicieron sin senal y venian en la
 * cola del telefono. Responde por cada una, para que el telefono sepa cuales
 * limpiar, cuales mostrar como rechazadas y cuales reintentar.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sesion = await getCurrentSession();
  if (!sesion) return Response.json({ error: "Tu sesión se cerró." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 4_500_000) {
    return Response.json({ error: "Demasiados datos en un envío." }, { status: 413 });
  }

  let cuerpo: { acciones?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const lote = Array.isArray(cuerpo.acciones) ? cuerpo.acciones : [];
  if (lote.length > MAX_ACCIONES) return Response.json({ error: "Demasiadas acciones en un envío." }, { status: 413 });

  const { resultados, sinSesion } = await ejecutarAcciones(sesion, lote, ACCIONES_SIN_SENAL);
  return Response.json({ resultados }, { status: sinSesion ? 401 : 200 });
}
