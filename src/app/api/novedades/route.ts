import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { crearNovedad } from "@/lib/novedades-servidor";

/** Recibe una novedad que venia en la cola del telefono. */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const sesion = await getCurrentSession();
  if (!sesion) return Response.json({ error: "Tu sesión se cerró." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 1_000_000) {
    return Response.json({ error: "La novedad pesa demasiado." }, { status: 413 });
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Novedad inválida." }, { status: 400 });
  }

  const r = await crearNovedad(sesion, cuerpo ?? {});
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  revalidatePath("/panel/novedades");
  revalidatePath("/panel");
  return Response.json({ id: r.datos.id, repetido: r.datos.repetido });
}
