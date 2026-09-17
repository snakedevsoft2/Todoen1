"use server";

import { requireSession } from "@/lib/auth";
import { BUSINESS_LABEL } from "@/lib/nav";
import { aiEnabled, askAi, conversarConHerramientas, type ChatTurn, type Contenido } from "@/lib/ai";
import { businessSnapshot, systemPrompt } from "@/lib/ai-context";
import { esDueno } from "@/lib/permisos-empleado";
import {
  actualizarNegocioIA,
  agregarEmpleadoIA,
  configurarMesasIA,
  crearCategoriaIA,
  crearProductoIA,
  herramientasDeConfiguracion,
} from "@/lib/ia-herramientas";

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
 *
 * Al dueño se le da ademas la posibilidad de que el asistente cree cosas
 * (productos, categorias, mesas, equipo, datos del negocio) cuando se lo pide,
 * para que un negocio nuevo quede armado de una vez. Al empleado no: el
 * asistente solo le contesta, nunca le cambia nada al negocio.
 */
export async function askAssistantAction(
  _prev: AssistantState,
  formData: FormData
): Promise<AssistantState> {
  const { user, staff } = await requireSession();

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
  const puedeCrear = esDueno(staff.role);
  const system = systemPrompt(snapshot, BUSINESS_LABEL[user.businessType], puedeCrear);

  // Solo los ultimos turnos: la conversacion vieja no aporta y cuesta.
  const recientes = turns.slice(-MAX_TURNOS);

  if (!puedeCrear) {
    const resultado = await askAi(system, recientes);
    if (!resultado.ok) return { turns, error: resultado.error };
    return { turns: [...turns, { role: "model", text: resultado.text }] };
  }

  const contents: Contenido[] = recientes.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
  const resultado = await conversarConHerramientas({
    system,
    contents,
    herramientas: herramientasDeConfiguracion(user.businessType),
    ejecutar: (name, args) => {
      switch (name) {
        case "crear_producto":
          return crearProductoIA(user.id, user.currency, args);
        case "crear_categoria":
          return crearCategoriaIA(user.id, args);
        case "configurar_mesas":
          return configurarMesasIA(user.id, args);
        case "agregar_empleado":
          return agregarEmpleadoIA(user.id, user.businessType, args);
        case "actualizar_negocio":
          return actualizarNegocioIA(user.id, args);
        default:
          return Promise.resolve({ ok: false, error: "Esa función no existe." });
      }
    },
  });

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
