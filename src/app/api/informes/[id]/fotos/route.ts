import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { agregarFoto } from "@/lib/informes";

/** Una foto por peticion: con mala senal, la que sube queda subida. */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getCurrentSession();
  if (!sesion) return Response.json({ error: "Tu sesión se cerró." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 1_000_000) {
    return Response.json({ error: "La foto pesa demasiado." }, { status: 413 });
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Foto inválida." }, { status: 400 });
  }

  const { id } = await params;
  const r = await agregarFoto(sesion, String(id), cuerpo ?? {});
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  revalidatePath("/panel/informes/" + id);
  return Response.json({ id: r.datos.id, repetido: r.datos.repetido });
}
