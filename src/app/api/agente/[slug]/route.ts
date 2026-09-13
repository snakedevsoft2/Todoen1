import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/ai";
import { configDe, responderAgente } from "@/lib/agente";
import { esLlaveWeb } from "@/lib/agente-reglas";

/**
 * El chat publico del agente, el de la burbuja en la pagina del negocio.
 *
 * No pide sesion: quien escribe es un cliente cualquiera. Por eso el negocio
 * sale de la direccion y no del cuerpo, y los topes de uso viven en
 * responderAgente, que es donde se cuenta.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noDisponible = () => Response.json({ error: "Este chat no está disponible." }, { status: 404 });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (Number(request.headers.get("content-length") ?? 0) > 10_000) {
    return Response.json({ error: "Ese mensaje es demasiado largo." }, { status: 413 });
  }

  let cuerpo: { conversacion?: unknown; mensaje?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Mensaje inválido." }, { status: 400 });
  }
  if (!esLlaveWeb(cuerpo?.conversacion)) {
    return Response.json({ error: "Conversación inválida." }, { status: 400 });
  }

  const { slug } = await params;
  const shop = await db.user.findUnique({ where: { slug: String(slug).slice(0, 120) } });
  if (!shop || shop.suspendedAt || !shop.publicOpen || !aiEnabled()) return noDisponible();
  const config = await configDe(shop.id);
  if (!config.webOn) return noDisponible();

  try {
    const r = await responderAgente({
      shop,
      canal: "web",
      contactKey: cuerpo.conversacion,
      mensaje: String(cuerpo.mensaje ?? ""),
    });
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    return Response.json({ respuesta: r.texto });
  } catch (error) {
    console.error("El agente no pudo responder:", error);
    return Response.json({ error: "No pude responder. Intenta otra vez en un momento." }, { status: 500 });
  }
}
