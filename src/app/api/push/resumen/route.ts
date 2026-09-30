import { mandarResumenes } from "@/lib/resumen-dia";

/**
 * El resumen del dia al dueño, por notificacion. Lo llama Vercel Cron una vez
 * al dia, despues del cierre (ver vercel.json). Protegido con CRON_SECRET,
 * igual que los otros crons.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Falta CRON_SECRET." }, { status: 500 });
  if (request.headers.get("authorization") !== "Bearer " + secret) {
    return new Response("No autorizado.", { status: 401 });
  }

  const enviados = await mandarResumenes();
  return Response.json({ enviados });
}
