import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { guardarDocumento } from "@/lib/documentos";

/** Guarda en la cuenta un documento escaneado (el PDF y su texto). */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  const r = await guardarDocumento(sesion, cuerpo ?? {});
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  if (!r.datos.repetido) revalidatePath("/panel/escaner");
  return Response.json({ id: r.datos.id, repetido: r.datos.repetido });
}
