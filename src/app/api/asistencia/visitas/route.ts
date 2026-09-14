import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { MAX_LOTE, registrarVisitas } from "@/lib/ubicacion";

/** Recibe las llegadas ("Llegué") que venian en la cola del telefono. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sesion = await getCurrentSession();
  if (!sesion) return new Response("No autorizado.", { status: 401 });

  let cuerpo: { visitas?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const lote = Array.isArray(cuerpo.visitas) ? cuerpo.visitas : [];
  if (lote.length > MAX_LOTE) return Response.json({ error: "Demasiadas llegadas en un envío." }, { status: 413 });
  const resultados = await registrarVisitas(sesion, lote);
  if (resultados.some((r) => r.estado === "guardado")) {
    revalidatePath("/panel/marcar");
    revalidatePath("/panel/planilla");
  }
  return Response.json({ resultados });
}
