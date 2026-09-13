/**
 * Preguntas de seguridad: la parte que no toca la base de datos.
 *
 * Va aparte de lib/seguridad.ts a proposito: el formulario de Ajustes corre en
 * el navegador y necesita la lista de preguntas. Si la importara de un archivo
 * que habla con la base, se traeria Prisma al paquete del cliente.
 */

export const PREGUNTAS = [
  "¿Cómo se llamaba tu primera mascota?",
  "¿En qué ciudad nació tu mamá?",
  "¿Cuál es el segundo nombre de tu papá?",
  "¿Cómo se llamaba tu escuela primaria?",
  "¿Cuál era tu apodo de niño?",
  "¿En qué barrio vivías a los 10 años?",
];

/** Largo minimo de una respuesta. Menos que esto se adivina en tres intentos. */
export const MIN_RESPUESTA = 3;

/**
 * Deja la respuesta en una forma unica antes de guardarla o compararla.
 *
 * Nadie recuerda si escribio "Bogotá" o "bogota", con espacio al final o sin
 * el. Si eso contara, la persona fallaria con la respuesta correcta y quedaria
 * bloqueada por el freno de intentos. Se quitan tildes, mayusculas, signos y
 * espacios repetidos; se conservan letras y numeros.
 */
export function normalizarRespuesta(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * La pregunta que se le muestra a un correo que no tiene pregunta.
 *
 * Si la pantalla dijera "ese correo no tiene pregunta" o "no existe", serviria
 * para averiguar quien tiene cuenta. Por eso a esos correos tambien se les
 * muestra una pregunta, que nunca se puede acertar. Sale siempre la misma para
 * el mismo correo: si cambiara al recargar, delataria que es inventada.
 */
export function preguntaFalsa(email: string): string {
  let h = 2166136261;
  for (const c of String(email).trim().toLowerCase()) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return PREGUNTAS[Math.abs(h) % PREGUNTAS.length];
}
