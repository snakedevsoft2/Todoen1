/**
 * Asistente del negocio.
 *
 * Usamos Gemini por su capa gratuita, llamando a la API por HTTP en vez de
 * meter una libreria: es una sola peticion y asi el proyecto no engorda.
 *
 * Para activarlo hay que poner GEMINI_API_KEY. Sin esa variable el apartado
 * no aparece y el resto de la aplicacion sigue igual.
 */
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/";

/** Se puede cambiar por env si el modelo gratuito cambia de nombre. */
function modelo(): string {
  return process.env.GEMINI_MODEL || "gemini-2.0-flash";
}

export function aiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export type ChatTurn = { role: "user" | "model"; text: string };

export type AiResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

/**
 * Le pregunta al modelo y devuelve el texto.
 *
 * Nunca lanza: cualquier problema vuelve como un mensaje que se le puede
 * mostrar a la persona. Un asistente que rompe la pantalla es peor que uno
 * que dice que no pudo.
 */
export async function askAi(
  system: string,
  turns: ChatTurn[],
  timeoutMs = 25000
): Promise<AiResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "El asistente no esta configurado." };

  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), timeoutMs);

  try {
    const response = await fetch(ENDPOINT + modelo() + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: control.signal,
      cache: "no-store",
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: {
          // Bajo a proposito: aqui se habla de plata, no queremos invenciones.
          temperature: 0.3,
          maxOutputTokens: 800,
        },
      }),
    });

    const data = (await response.json()) as GeminiResponse;

    if (!response.ok) {
      if (response.status === 429) {
        return {
          ok: false,
          error: "Se acabaron las consultas gratuitas por hoy. Intenta mas tarde.",
        };
      }
      if (response.status === 400 || response.status === 403) {
        return { ok: false, error: "La clave del asistente no es valida. Revisala en Vercel." };
      }
      return { ok: false, error: data.error?.message ?? "No pudimos consultar al asistente." };
    }

    if (data.promptFeedback?.blockReason) {
      return { ok: false, error: "El asistente no pudo responder eso. Prueba con otra pregunta." };
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!text) return { ok: false, error: "El asistente no devolvio respuesta. Intenta otra vez." };
    return { ok: true, text };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "El asistente se demoro demasiado. Intenta otra vez." };
    }
    return { ok: false, error: "No pudimos conectar con el asistente." };
  } finally {
    clearTimeout(timer);
  }
}
