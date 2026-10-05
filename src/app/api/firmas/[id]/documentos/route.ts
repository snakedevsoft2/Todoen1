import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { agregarDocumento } from "@/lib/firmas";

/**
 * Sube un documento a una solicitud de firma: un PDF, una foto o uno del
 * Escaner. Uno por peticion, para no pasar el tope de lo que se puede mandar.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getCurrentSession();
  if (!sesion) return Response.json({ error: "Tu sesión se cerró." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 4_400_000) {
    return Response.json({ error: "El documento pesa más de 3 MB." }, { status: 413 });
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Documento inválido." }, { status: 400 });
  }

  const { id } = await params;
  const r = await agregarDocumento(sesion, id, cuerpo ?? {});
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  revalidatePath("/panel/firmas/" + id);
  return Response.json({ id: r.datos.id });
}
