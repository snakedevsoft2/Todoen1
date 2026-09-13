import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { agregarAdjunto } from "@/lib/informes";

/** Un PDF de evidencia por peticion, igual que las fotos. */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getCurrentSession();
  if (!sesion) return Response.json({ error: "Tu sesión se cerró." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 4_600_000) {
    return Response.json({ error: "El PDF pesa más de 3 MB." }, { status: 413 });
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "PDF inválido." }, { status: 400 });
  }

  const { id } = await params;
  const r = await agregarAdjunto(sesion, String(id), cuerpo ?? {});
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  revalidatePath("/panel/informes/" + id);
  return Response.json({ id: r.datos.id, repetido: r.datos.repetido });
}
