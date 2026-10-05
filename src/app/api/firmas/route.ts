import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { crearSolicitud } from "@/lib/firmas";

/** Crea una solicitud de firma. Los documentos se suben despues, uno por uno. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sesion = await getCurrentSession();
  if (!sesion) return Response.json({ error: "Tu sesión se cerró." }, { status: 401 });

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const r = await crearSolicitud(sesion, cuerpo ?? {});
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  revalidatePath("/panel/firmas");
  return Response.json({ id: r.datos.id });
}
