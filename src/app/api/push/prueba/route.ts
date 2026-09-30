import { getCurrentSession } from "@/lib/auth";
import { probarAvisos } from "@/lib/push";

/**
 * Manda una notificacion de prueba a los celulares de quien la pide (solo los
 * suyos) y responde que paso: cuantos hay guardados, cuantos salieron y por
 * que fallaron los demas. Es el boton "Enviar prueba" de Mi perfil.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const sesion = await getCurrentSession();
  if (!sesion) return new Response("No autorizado.", { status: 401 });
  const r = await probarAvisos(sesion.user.id, sesion.staff.id);
  return Response.json(r);
}
