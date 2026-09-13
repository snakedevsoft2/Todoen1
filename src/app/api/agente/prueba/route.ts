import { getCurrentSession } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";
import { responderAgente } from "@/lib/agente";
import { esLlaveWeb } from "@/lib/agente-reglas";

/**
 * El chat de prueba del panel.
 *
 * Contesta igual que el agente de verdad, aunque este apagado, pero las
 * funciones corren en modo prueba: revisan que el turno o el pedido se podrian
 * hacer y no guardan nada. Asi el dueño lo ensaya sin llenarse la agenda de
 * turnos falsos.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const sesion = await getCurrentSession();
  if (!sesion) return Response.json({ error: "Tu sesión se cerró. Vuelve a entrar." }, { status: 401 });
  if (sesion.staff.role !== "DUENO") return Response.json({ error: "Solo el dueño puede probar el agente." }, { status: 403 });
  if (!aiEnabled()) return Response.json({ error: "Falta la clave del modelo en el servidor." }, { status: 400 });

  let cuerpo: { conversacion?: unknown; mensaje?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Mensaje inválido." }, { status: 400 });
  }
  if (!esLlaveWeb(cuerpo?.conversacion)) {
    return Response.json({ error: "Conversación inválida." }, { status: 400 });
  }

  try {
    const r = await responderAgente({
      shop: sesion.user,
      canal: "prueba",
      contactKey: cuerpo.conversacion,
      mensaje: String(cuerpo.mensaje ?? ""),
    });
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
    return Response.json({ respuesta: r.texto });
  } catch (error) {
    console.error("El agente de prueba no pudo responder:", error);
    return Response.json({ error: "No pude responder. Intenta otra vez." }, { status: 500 });
  }
}
