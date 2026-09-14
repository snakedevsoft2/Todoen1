import { getCurrentSession } from "@/lib/auth";
import { MAX_LOTE, recibirUbicaciones } from "@/lib/ubicacion";

/**
 * Recibe las ubicaciones de la jornada que venian en la cola del telefono.
 * Responde por cada una, para que el telefono sepa cuales limpiar.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sesion = await getCurrentSession();
  if (!sesion) return new Response("No autorizado.", { status: 401 });

  let cuerpo: { ubicaciones?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const lote = Array.isArray(cuerpo.ubicaciones) ? cuerpo.ubicaciones : [];
  if (lote.length > MAX_LOTE) return Response.json({ error: "Demasiadas ubicaciones en un envío." }, { status: 413 });
  return Response.json({ resultados: await recibirUbicaciones(sesion, lote) });
}
