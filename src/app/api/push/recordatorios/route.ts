import { recordarMarcar } from "@/lib/recordar-marcar";

/**
 * El recordatorio de marcar entrada (en la mañana) o salida (en la tarde). Lo
 * llama Vercel Cron con ?tipo=entrada o ?tipo=salida (ver vercel.json).
 * Protegido con CRON_SECRET, igual que los otros crons.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Falta CRON_SECRET." }, { status: 500 });

  const url = new URL(request.url);
  const auth = request.headers.get("authorization");
  if (auth !== "Bearer " + secret && url.searchParams.get("secret") !== secret) {
    return new Response("No autorizado.", { status: 401 });
  }

  const tipo = url.searchParams.get("tipo") === "salida" ? "salida" : "entrada";
  const enviados = await recordarMarcar(tipo);
  return Response.json({ tipo, enviados });
}
