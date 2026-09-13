/**
 * Conexion con el modelo de lenguaje.
 *
 * Usamos Gemini por su capa gratuita, llamando a la API por HTTP en vez de
 * meter una libreria: son peticiones sueltas y asi el proyecto no engorda.
 *
 * Para activarlo hay que poner GEMINI_API_KEY. Sin esa variable el asistente y
 * el agente no aparecen y el resto de la aplicacion sigue igual.
 */

/** Se puede cambiar por env si el modelo cambia de nombre. */
function modelo(): string {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

/**
 * La direccion de la API. Solo se cambia en las pruebas, para hablar con un
 * modelo de mentira que responde siempre lo mismo.
 */
function base(): string {
  return process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/models/";
}

export function aiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export type ChatTurn = { role: "user" | "model"; text: string };

export type AiResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * Un pedazo de un mensaje del modelo.
 *
 * Lleva indice abierto a proposito: los modelos que "piensan" devuelven campos
 * extra (la firma de lo que pensaron) que hay que devolverles tal cual en la
 * siguiente vuelta, aunque aqui no se usen.
 */
export type Parte = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  [otro: string]: unknown;
};

export type Contenido = { role: "user" | "model"; parts: Parte[] };

/** Una funcion que el modelo puede pedir que ejecutemos. */
export type Herramienta = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type GeminiResponse = {
  candidates?: { content?: { parts?: Parte[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

type Pedido = {
  system: string;
  contents: Contenido[];
  herramientas?: Herramienta[];
  /** Obliga a contestar con texto aunque haya herramientas. */
  soloTexto?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};

/**
 * Una sola peticion al modelo.
 *
 * Nunca lanza: cualquier problema vuelve como un mensaje que se le puede
 * mostrar a la persona.
 */
async function pedir(p: Pedido): Promise<{ ok: true; parts: Parte[] } | { ok: false; error: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "El asistente no está configurado." };

  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), p.timeoutMs ?? 25000);
  const m = modelo();

  try {
    const response = await fetch(base() + m + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: control.signal,
      cache: "no-store",
      body: JSON.stringify({
        system_instruction: { parts: [{ text: p.system }] },
        contents: p.contents,
        ...(p.herramientas?.length
          ? {
              tools: [{ function_declarations: p.herramientas }],
              tool_config: { function_calling_config: { mode: p.soloTexto ? "NONE" : "AUTO" } },
            }
          : {}),
        generationConfig: {
          // Bajo a proposito: aqui se habla de plata y de horarios, no
          // queremos invenciones.
          temperature: p.temperature ?? 0.3,
          maxOutputTokens: p.maxOutputTokens ?? 800,
          // El flash 2.5 "piensa" antes de contestar si no se le dice nada, y
          // eso se come los tokens de la respuesta y la vuelve lenta. Para
          // contestar a un cliente no hace falta.
          ...(/2\.5-flash/.test(m) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    });

    const data = (await response.json().catch(() => ({}))) as GeminiResponse;

    if (!response.ok) {
      if (response.status === 429) {
        return { ok: false, error: "Se acabaron las consultas gratuitas por hoy. Intenta más tarde." };
      }
      if (response.status === 400 || response.status === 403) {
        return { ok: false, error: "La clave del asistente no es válida. Revísala en Vercel." };
      }
      return { ok: false, error: data.error?.message ?? "No pudimos consultar al asistente." };
    }

    if (data.promptFeedback?.blockReason) {
      return { ok: false, error: "El asistente no pudo responder eso. Prueba con otra pregunta." };
    }

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    if (parts.length === 0) {
      return { ok: false, error: "El asistente no devolvió respuesta. Intenta otra vez." };
    }
    return { ok: true, parts };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "El asistente se demoró demasiado. Intenta otra vez." };
    }
    return { ok: false, error: "No pudimos conectar con el asistente." };
  } finally {
    clearTimeout(timer);
  }
}

function textoDe(parts: Parte[]): string {
  return parts
    .map((p) => (typeof p.text === "string" && !p.thought ? p.text : ""))
    .join("")
    .trim();
}

/** Pregunta simple, sin herramientas: el asistente del panel. */
export async function askAi(system: string, turns: ChatTurn[], timeoutMs = 25000): Promise<AiResult> {
  const r = await pedir({
    system,
    timeoutMs,
    contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
  });
  if (!r.ok) return r;
  const text = textoDe(r.parts);
  if (!text) return { ok: false, error: "El asistente no devolvió respuesta. Intenta otra vez." };
  return { ok: true, text };
}

export type Llamada = { name: string; args: Record<string, unknown>; resultado: Record<string, unknown> };

/**
 * Conversacion en la que el modelo puede pedir que ejecutemos funciones.
 *
 * El modelo nunca toca la base: pide "agendar_turno con estos datos", nosotros
 * lo ejecutamos con todas las validaciones y le devolvemos como salio. Asi lo
 * peor que puede hacer un modelo confundido es pedir algo que se rechaza.
 *
 * Tiene tope de vueltas: en la ultima se le obliga a contestar con texto, para
 * que un modelo que pide y pide funciones no quede dando vueltas para siempre.
 */
export async function conversarConHerramientas(opciones: {
  system: string;
  contents: Contenido[];
  herramientas: Herramienta[];
  ejecutar: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  maxVueltas?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
}): Promise<{ ok: true; text: string; llamadas: Llamada[] } | { ok: false; error: string; llamadas: Llamada[] }> {
  const contents = [...opciones.contents];
  const llamadas: Llamada[] = [];
  const maxVueltas = Math.max(1, opciones.maxVueltas ?? 4);

  for (let vuelta = 0; vuelta < maxVueltas; vuelta += 1) {
    const r = await pedir({
      system: opciones.system,
      contents,
      herramientas: opciones.herramientas,
      soloTexto: vuelta === maxVueltas - 1,
      timeoutMs: opciones.timeoutMs,
      maxOutputTokens: opciones.maxOutputTokens,
    });
    if (!r.ok) return { ...r, llamadas };

    const pedidas = r.parts.filter((p) => p.functionCall?.name);
    if (pedidas.length === 0) {
      const text = textoDe(r.parts);
      if (!text) return { ok: false, error: "El asistente no devolvió respuesta.", llamadas };
      return { ok: true, text, llamadas };
    }

    contents.push({ role: "model", parts: r.parts });
    const respuestas: Parte[] = [];
    for (const p of pedidas.slice(0, 4)) {
      const name = p.functionCall!.name;
      const args = (p.functionCall!.args ?? {}) as Record<string, unknown>;
      let resultado: Record<string, unknown>;
      try {
        resultado = await opciones.ejecutar(name, args);
      } catch {
        resultado = { ok: false, error: "No se pudo completar. Pide disculpas y ofrece que el negocio le escriba." };
      }
      llamadas.push({ name, args, resultado });
      respuestas.push({ functionResponse: { name, response: resultado } });
    }
    contents.push({ role: "user", parts: respuestas });
  }

  return { ok: false, error: "El asistente no alcanzó a responder.", llamadas };
}
