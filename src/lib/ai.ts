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
  return process.env.GEMINI_MODEL || "gemini-3.6-flash";
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
type Respuesta = { ok: true; parts: Parte[] } | { ok: false; error: string; status?: number };

/**
 * Los modelos a los que se vuelve si Google no reconoce el configurado.
 *
 * Google retira modelos sin aviso: en septiembre de 2026 gemini-2.5-flash dejo
 * de estar disponible para cuentas nuevas y el agente quedo mudo. Por eso no
 * se depende de un solo nombre.
 */
const MODELOS_DE_RESPALDO = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];

/**
 * Si vale la pena probar con otro modelo.
 *
 * Si: el modelo no existe o esta retirado (400/404), no esta incluido en el
 * plan de la clave (403 que no es de la clave), o su cuota gratuita es cero
 * (429 con "limit: 0"). No: la clave es invalida o se acabo la cuota normal,
 * que con otro modelo tampoco se arregla.
 */
function probarOtroModelo(r: { status?: number; error: string }): boolean {
  if (r.status === 400 || r.status === 404) return true;
  if (r.status === 403) return !/API key/i.test(r.error);
  if (r.status === 429) return /limit:\s*0|free.?tier|not available/i.test(r.error);
  return false;
}

/** El modelo que Google recomienda en su mensaje de error, si recomienda uno. */
export function modeloRecomendado(motivo: string): string | null {
  // El nombre lleva puntos ("gemini-3.6-flash"): se toma completo y solo se
  // quita la puntuacion que haya quedado pegada al final de la frase.
  const m = /use\s+(?:models\/)?(gemini-[\w.-]+)/i.exec(motivo);
  return m ? m[1].replace(/[.-]+$/, "") : null;
}

async function pedir(p: Pedido): Promise<Respuesta> {
  const primero = await pedirUnaVez(p, modelo(), true);
  if (primero.ok) return primero;
  // Si Google no reconoce el modelo o algo de la configuracion (400/404), se
  // reintenta con el modelo que Google recomienda y luego con los de respaldo,
  // sin la opcion de "pensar". Asi un modelo retirado no deja mudo al agente.
  if (!probarOtroModelo(primero)) return primero;

  const intentos = [modeloRecomendado(primero.error), ...MODELOS_DE_RESPALDO].filter(
    (m, i, lista): m is string => Boolean(m) && m !== modelo() && lista.indexOf(m) === i
  );
  let ultimo: Respuesta = primero;
  for (const m of intentos) {
    ultimo = await pedirUnaVez(p, m, false);
    if (ultimo.ok) return ultimo;
    if (!probarOtroModelo(ultimo)) break;
  }
  return ultimo;
}

async function pedirUnaVez(p: Pedido, m: string, conPensamiento: boolean): Promise<Respuesta> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "El asistente no está configurado." };

  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), p.timeoutMs ?? 25000);

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
          // Los modelos que "piensan" gastan parte de este tope razonando antes
          // de contestar. Al flash 2.5 se le apaga eso; a los demas se les da
          // mas espacio, para que el razonamiento no deje la respuesta cortada.
          maxOutputTokens:
            conPensamiento && /2\.5-flash/.test(m)
              ? (p.maxOutputTokens ?? 800)
              : Math.max((p.maxOutputTokens ?? 800) * 4, 2048),
          ...(conPensamiento && /2\.5-flash/.test(m) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    });

    const data = (await response.json().catch(() => ({}))) as GeminiResponse;

    if (!response.ok) {
      // El motivo que da Google, tal cual: sin el no hay forma de saber si es
      // la clave, la cuota o el modelo. La clave nunca va en el mensaje.
      const motivo = (data.error?.message ?? "").slice(0, 300);
      console.error("Gemini respondio " + response.status + " (" + m + "): " + motivo);
      const s = response.status;
      if (s === 429) {
        return { ok: false, status: s, error: "Se acabaron las consultas gratuitas de Gemini por ahora (límite por minuto o por día). " + motivo };
      }
      if (s === 401 || /API key/i.test(motivo)) {
        return { ok: false, status: s, error: "Google rechazó la clave de Gemini. Revisa GEMINI_API_KEY en Vercel. " + motivo };
      }
      if (s === 403) {
        return {
          ok: false,
          status: s,
          error: "Google no deja usar el modelo " + m + " con esta clave: activa la facturación del proyecto en Google AI Studio. " + motivo,
        };
      }
      return { ok: false, status: s, error: "Gemini respondió " + s + " con el modelo " + m + ": " + (motivo || "sin detalle") };
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
    console.error("No se pudo conectar con Gemini:", error);
    return { ok: false, error: "No pudimos conectar con Gemini: " + String(error).slice(0, 160) };
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

export type Prueba = { ok: boolean; detalle: string };

/**
 * Prueba la conexion con Gemini: una pregunta simple y otra con funciones,
 * que es lo que usa el agente. Para el boton de diagnostico del panel: dice
 * exactamente que falla (la clave, la cuota, el modelo) sin tener que ir a
 * buscar en los registros del servidor.
 */
export async function probarIa(): Promise<{ clave: boolean; modelo: string; simple: Prueba; herramientas: Prueba }> {
  const vacio = { ok: false, detalle: "Sin probar." };
  if (!aiEnabled()) return { clave: false, modelo: modelo(), simple: vacio, herramientas: vacio };

  const simple = await pedir({
    system: "Responde solo con la palabra: listo.",
    contents: [{ role: "user", parts: [{ text: "Di listo." }] }],
    maxOutputTokens: 20,
    timeoutMs: 20000,
  });
  const herramientas = await pedir({
    system: "Eres un asistente de prueba. Saluda en una frase.",
    contents: [{ role: "user", parts: [{ text: "hola" }] }],
    herramientas: [
      {
        name: "ver_horarios",
        description: "Consulta las horas libres de un dia.",
        parameters: { type: "object", properties: { dia: { type: "string", description: "AAAA-MM-DD" } }, required: ["dia"] },
      },
    ],
    maxOutputTokens: 60,
    timeoutMs: 20000,
  });

  return {
    clave: true,
    modelo: modelo(),
    simple: simple.ok ? { ok: true, detalle: "Respondió bien." } : { ok: false, detalle: simple.error },
    herramientas: herramientas.ok ? { ok: true, detalle: "Respondió bien." } : { ok: false, detalle: herramientas.error },
  };
}

/**
 * Modelos de Gemini que dibujan imagenes, en el orden en que se prueban.
 * Se puede poner el primero por env si Google renombra alguno. Algunos no
 * estan en la capa gratuita (cuota 0), por eso se prueba con el siguiente.
 */
function modelosDeImagen(): string[] {
  const lista = [
    process.env.GEMINI_IMAGE_MODEL,
    "gemini-2.5-flash-image",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-exp-image-generation",
  ];
  return lista.filter((m, i, l): m is string => Boolean(m) && l.indexOf(m) === i);
}

export type ImagenResult = { ok: true; mime: string; base64: string } | { ok: false; error: string };

/**
 * Pide una imagen nueva a partir de otra y un texto.
 *
 * Aparte de `pedir` porque los modelos de imagen no aceptan instrucciones de
 * sistema ni el tope de tokens, y devuelven la imagen dentro de `inlineData`.
 * Nunca lanza.
 */
export async function editarImagen(
  instruccion: string,
  imagen: { mime: string; base64: string },
  timeoutMs = 55000
): Promise<ImagenResult> {
  if (!process.env.GEMINI_API_KEY) return { ok: false, error: "La IA no está configurada." };

  let ultimo: ImagenResult = { ok: false, error: "No se pudo generar la imagen." };
  for (const m of modelosDeImagen()) {
    const r = await editarConModelo(m, instruccion, imagen, timeoutMs);
    if (r.ok) return r;
    ultimo = r;
    // Solo se prueba otro modelo si este no existe o no esta en el plan.
    if (!r.otroModelo) break;
  }
  return ultimo;
}

async function editarConModelo(
  m: string,
  instruccion: string,
  imagen: { mime: string; base64: string },
  timeoutMs: number
): Promise<ImagenResult & { otroModelo?: boolean }> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), timeoutMs);
  try {
    const response = await fetch(base() + m + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      signal: control.signal,
      cache: "no-store",
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: instruccion }, { inlineData: { mimeType: imagen.mime, data: imagen.base64 } }] },
        ],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });
    const data = (await response.json().catch(() => ({}))) as GeminiResponse;

    if (!response.ok) {
      const motivo = (data.error?.message ?? "").slice(0, 300);
      console.error("Gemini (imagen) respondio " + response.status + " (" + m + "): " + motivo);
      const s = response.status;
      const sinCupo = s === 429 && /limit:\s*0|free.?tier|not available/i.test(motivo);
      const porMinuto = s === 429 && !sinCupo;
      if (porMinuto) {
        return { ok: false, error: "Se llegó al límite de imágenes por ahora. Espera un minuto y prueba otra vez." };
      }
      const texto = sinCupo
        ? "Tu clave gratuita no incluye imágenes con " + m + " (cuota 0). "
        : s === 403 || s === 404
          ? "Tu clave no tiene acceso a " + m + ". "
          : "Gemini respondió " + s + " con " + m + ". ";
      return { ok: false, error: texto + motivo, otroModelo: sinCupo || s === 403 || s === 404 || s === 400 };
    }
    if (data.promptFeedback?.blockReason) {
      return { ok: false, error: "La IA no aceptó esta foto. Prueba con otra." };
    }

    const partes = (data.candidates?.[0]?.content?.parts ?? []) as { inlineData?: { mimeType?: string; data?: string } }[];
    const hallada = partes.find((p) => p.inlineData?.data);
    if (!hallada?.inlineData?.data) {
      return { ok: false, error: "La IA no devolvió una imagen. Intenta otra vez." };
    }
    return { ok: true, mime: hallada.inlineData.mimeType || "image/png", base64: hallada.inlineData.data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "La IA se demoró demasiado. Intenta otra vez." };
    }
    console.error("No se pudo conectar con Gemini (imagen):", error);
    return { ok: false, error: "No pudimos conectar con la IA." };
  } finally {
    clearTimeout(timer);
  }
}
