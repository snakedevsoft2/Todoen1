import { enviarProgramados } from "@/lib/envios-crm";

/**
 * Manda los mensajes programados a los clientes que ya llegaron a su hora.
 *
 * El envio diario (/api/recordatorios) tambien lo hace, y el panel lo hace
 * cada vez que alguien lo usa. Esta direccion es para quien quiera un cron mas
 * seguido (por ejemplo cada hora, con cron-job.org). Pide CRON_SECRET igual
 * que los recordatorios.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Falta CRON_SECRET en el servidor." }, { status: 500 });
  const url = new URL(request.url);
  if (request.headers.get("authorization") !== "Bearer " + secret && url.searchParams.get("secret") !== secret) {
    return new Response("No autorizado.", { status: 401 });
  }
  return Response.json(await enviarProgramados({ limite: 500 }));
}
