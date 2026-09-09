"use server";

import { requireUser } from "@/lib/auth";
import { BUSINESS_LABEL } from "@/lib/nav";
import { aiEnabled, askAi, type ChatTurn } from "@/lib/ai";
import { businessSnapshot, systemPrompt } from "@/lib/ai-context";

export type AssistantState =
  | { turns: ChatTurn[]; error?: string }
  | undefined;

/** Cuantos mensajes de ida y vuelta le mandamos al modelo. */
const MAX_TURNOS = 12;
const MAX_LARGO = 1000;

/**
 * Le pregunta al asistente.
 *
 * La conversacion viaja completa desde el navegador y no se guarda en la base
 * de datos: son consejos, no un registro del negocio, y asi no acumulamos algo
 * que despues habria que cuidar.
 *
 * El resumen de cifras se arma aqui, en el servidor, a partir del negocio de la
 * sesion: el navegador no decide de que negocio son los numeros.
 */
export async function askAssistantAction(
  _prev: AssistantState,
  formData: FormData
): Promise<AssistantState> {
  const user = await requireUser();

  const previas: ChatTurn[] = leerHistorial(formData.get("history"));
  const pregunta = String(formData.get("question") ?? "").trim().slice(0, MAX_LARGO);

  if (!pregunta) return { turns: previas, error: "Escribe tu pregunta." };

  const turns: ChatTurn[] = [...previas, { role: "user", text: pregunta }];

  if (!aiEnabled()) {
    return {
      turns,
      error: "El asistente todavia no esta configurado. Falta la clave en el servidor.",
    };
  }

  const snapshot = await businessSnapshot(user);
  const system = systemPrompt(snapshot, BUSINESS_LABEL[user.businessType]);

  // Solo los ultimos turnos: la conversacion vieja no aporta y cuesta.
  const resultado = await askAi(system, turns.slice(-MAX_TURNOS));

  if (!resultado.ok) return { turns, error: resultado.error };

  return { turns: [...turns, { role: "model", text: resultado.text }] };
}

/** El historial llega como JSON desde el navegador: hay que limpiarlo. */
function leerHistorial(raw: FormDataEntryValue | null): ChatTurn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t?.role === "user" || t?.role === "model")
      .map((t) => ({
        role: t.role as "user" | "model",
        text: String(t.text ?? "").slice(0, MAX_LARGO * 4),
      }))
      .filter((t) => t.text.length > 0)
      .slice(-MAX_TURNOS);
  } catch {
    return [];
  }
}
