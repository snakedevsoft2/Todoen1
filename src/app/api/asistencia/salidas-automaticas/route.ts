import { cerrarSalidasOlvidadasDeTodos } from "@/lib/salida-automatica";

/**
 * Cierre de medianoche: le pone la salida a quien marco entrada y no marco
 * salida. Lo llama Vercel Cron pasada la medianoche de Colombia (ver
 * vercel.json); las pantallas de Marcar, Mis lavados y Planilla hacen lo mismo
 * al abrirse, por si el cron no corrio.
 *
 * Se protege con CRON_SECRET, igual que /api/recordatorios.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Falta CRON_SECRET." }, { status: 500 });

  const auth = request.headers.get("authorization");
  const alterno = new URL(request.url).searchParams.get("secret");
  if (auth !== "Bearer " + secret && alterno !== secret) {
    return new Response("No autorizado.", { status: 401 });
  }

  const cerradas = await cerrarSalidasOlvidadasDeTodos();
  return Response.json({ cerradas });
}
