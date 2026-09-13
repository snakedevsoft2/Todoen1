import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { enviarInforme } from "@/lib/informes";

/** El reporte ya subio completo: se le entrega al administrador. */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getCurrentSession();
  if (!sesion) return Response.json({ error: "Tu sesión se cerró." }, { status: 401 });

  const { id } = await params;
  const r = await enviarInforme(sesion, String(id));
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  revalidatePath("/panel/informes");
  revalidatePath("/panel");
  return Response.json({ ok: true, yaEstaba: r.datos.yaEstaba });
}
