import { getCurrentSession } from "@/lib/auth";
import { crearInforme } from "@/lib/informes";

/**
 * Crea un reporte que venia en la cola del telefono. Si ya lo tenia (el envio
 * anterior se corto antes de confirmar), responde el mismo id.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sesion = await getCurrentSession();
  if (!sesion) return Response.json({ error: "Tu sesión se cerró." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 50_000) {
    return Response.json({ error: "El reporte es demasiado largo." }, { status: 413 });
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Reporte inválido." }, { status: 400 });
  }

  const r = await crearInforme(sesion, cuerpo ?? {});
  return r.ok ? Response.json({ id: r.datos.id, repetido: r.datos.repetido }) : Response.json({ error: r.error }, { status: r.status });
}
