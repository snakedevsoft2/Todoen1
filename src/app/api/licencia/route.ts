import { getCurrentSession } from "@/lib/auth";
import { MAX_DIAS_SIN_CONEXION } from "@/lib/pagos";

/**
 * Si la cuenta de este telefono sigue activa.
 *
 * El telefono lo pregunta cada vez que tiene senal y el trabajador de fondo
 * guarda la respuesta: sin ella, lo guardado para usar sin senal no se abre.
 * Una cuenta suspendida (o una sesion cerrada) responde 401 y el telefono
 * borra lo que tenia guardado de esa cuenta.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const sesion = await getCurrentSession();
  const sinCache = { "Cache-Control": "no-store" };
  if (!sesion) return Response.json({ activa: false }, { status: 401, headers: sinCache });
  return Response.json(
    { activa: true, pagadaHasta: sesion.user.paidUntil?.toISOString() ?? null, maxDiasSinConexion: MAX_DIAS_SIN_CONEXION },
    { headers: sinCache }
  );
}
