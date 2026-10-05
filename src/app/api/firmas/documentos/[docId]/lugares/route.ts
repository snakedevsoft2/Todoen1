import { getCurrentSession } from "@/lib/auth";
import { guardarLugares } from "@/lib/firmas";

/** Guarda donde tiene que firmar el cliente dentro de un documento. */
export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ docId: string }> }) {
  const sesion = await getCurrentSession();
  if (!sesion) return Response.json({ error: "Tu sesión se cerró." }, { status: 401 });

  let cuerpo: { spots?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const { docId } = await params;
  const r = await guardarLugares(sesion, docId, cuerpo?.spots);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ spots: r.datos.spots });
}
