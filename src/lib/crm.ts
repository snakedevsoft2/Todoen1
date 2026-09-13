/**
 * Las reglas del CRM que no necesitan base de datos.
 *
 * Van aparte de lib/clientes.ts para que las pantallas del navegador puedan
 * usarlas sin arrastrar Prisma, y para probarlas sin levantar nada.
 */

export type Etapa = "NUEVO" | "CONTACTADO" | "PROPUESTA" | "NEGOCIACION" | "GANADO" | "PERDIDO";

export type Tono = "slate" | "blue" | "green" | "amber" | "red";

/** Las columnas del embudo, en el orden en que avanza una venta. */
export const ETAPAS: { key: Etapa; label: string; hint: string; tono: Tono }[] = [
  { key: "NUEVO", label: "Nuevo", hint: "Preguntó o llegó por primera vez", tono: "slate" },
  { key: "CONTACTADO", label: "Contactado", hint: "Ya le escribiste o lo llamaste", tono: "blue" },
  { key: "PROPUESTA", label: "Propuesta", hint: "Tiene el precio o la cotización", tono: "blue" },
  { key: "NEGOCIACION", label: "Negociando", hint: "Lo está pensando", tono: "amber" },
  { key: "GANADO", label: "Ganado", hint: "Compró", tono: "green" },
  { key: "PERDIDO", label: "Perdido", hint: "No se dio", tono: "red" },
];

export function esEtapa(v: unknown): v is Etapa {
  return ETAPAS.some((e) => e.key === v);
}

/** Ganado y perdido cierran la oportunidad: ya no hay nada que empujar. */
export function esCerrada(etapa: Etapa): boolean {
  return etapa === "GANADO" || etapa === "PERDIDO";
}

export function etapaDe(etapa: string) {
  return ETAPAS.find((e) => e.key === etapa) ?? ETAPAS[0];
}

export type TipoInteraccion = "NOTA" | "LLAMADA" | "WHATSAPP" | "VISITA" | "CORREO" | "CHAT";

export const INTERACCIONES: { key: TipoInteraccion; label: string }[] = [
  { key: "NOTA", label: "Nota" },
  { key: "LLAMADA", label: "Llamada" },
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "VISITA", label: "Visita" },
  { key: "CORREO", label: "Correo" },
  { key: "CHAT", label: "Chat" },
];

export function esInteraccion(v: unknown): v is TipoInteraccion {
  return INTERACCIONES.some((i) => i.key === v);
}

/**
 * Si la interaccion cuenta como haber hablado con el cliente.
 *
 * Una nota es algo que uno se apunta, no una conversacion: si contara, un
 * cliente al que nadie ha llamado en meses saldria como atendido ayer.
 */
export function esContacto(tipo: TipoInteraccion): boolean {
  return tipo !== "NOTA";
}

/**
 * La llave con la que se reconoce a un cliente por su telefono.
 *
 * Son los ultimos diez digitos: el mismo numero llega como "300 123 4567",
 * "+57 3001234567" o "573001234567" segun quien lo escribio, y los diez del
 * final son los que no cambian.
 */
export function llaveTelefono(phone: string | null | undefined): string | null {
  const digitos = String(phone ?? "").replace(/\D/g, "");
  if (digitos.length < 7) return null;
  return digitos.slice(-10);
}

/** El nombre sin tildes, sin mayusculas y sin espacios de sobra. */
export function llaveNombre(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type EstadoSeguimiento = "hecho" | "atrasado" | "hoy" | "proximo";

/** En que grupo cae un seguimiento. `hoy` va en "YYYY-MM-DD" del negocio. */
export function estadoSeguimiento(
  s: { dueDay: string; doneAt: Date | string | null },
  hoy: string
): EstadoSeguimiento {
  if (s.doneAt) return "hecho";
  if (s.dueDay < hoy) return "atrasado";
  if (s.dueDay === hoy) return "hoy";
  return "proximo";
}

/**
 * Un numero en solo digitos, para mostrarlo.
 *
 * El "+" solo va si trae indicativo: "+3001234567" parece un numero de otro
 * pais y no lo es.
 */
export function telefonoVisible(digitos: string): string {
  return digitos.length > 10 ? "+" + digitos : digitos;
}

export function primerNombre(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * Llena el mensaje para cada cliente.
 *
 * Se usa el primer nombre y no el completo: "Hola Carlos" suena a persona,
 * "Hola Carlos Andrés Pérez Gómez" suena a cobro de banco.
 */
export function aplicarPlantilla(
  plantilla: string,
  datos: { nombre: string; negocio: string }
): string {
  return plantilla
    .replace(/\{nombre\}/gi, primerNombre(datos.nombre))
    .replace(/\{negocio\}/gi, datos.negocio);
}

export const COLORES_ETIQUETA = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#475569",
];

export function esColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
}

/** Cuantos dias lleva sin que nadie le hable. Null si nunca. */
export function diasSinContacto(lastContactAt: Date | null, ahora = new Date()): number | null {
  if (!lastContactAt) return null;
  return Math.max(0, Math.floor((ahora.getTime() - lastContactAt.getTime()) / 86_400_000));
}

export type ResumenEtapa = { cuantos: number; valor: number };

/** Cuantas oportunidades y cuanta plata hay en cada columna. */
export function resumenEmbudo(deals: { stage: string; value: number }[]): Record<Etapa, ResumenEtapa> {
  const resumen = Object.fromEntries(ETAPAS.map((e) => [e.key, { cuantos: 0, valor: 0 }])) as Record<
    Etapa,
    ResumenEtapa
  >;
  for (const d of deals) {
    if (!esEtapa(d.stage)) continue;
    resumen[d.stage].cuantos += 1;
    resumen[d.stage].valor += d.value;
  }
  return resumen;
}

/** Plata que sigue en juego: todo lo que no esta ganado ni perdido. */
export function valorAbierto(resumen: Record<Etapa, ResumenEtapa>): number {
  return ETAPAS.filter((e) => !esCerrada(e.key)).reduce((s, e) => s + resumen[e.key].valor, 0);
}

/**
 * De las que ya se cerraron, cuantas se ganaron, en porcentaje.
 *
 * Null mientras no se haya cerrado ninguna: un 0% sin datos asusta sin razon.
 */
export function tasaDeCierre(resumen: Record<Etapa, ResumenEtapa>): number | null {
  const ganadas = resumen.GANADO.cuantos;
  const cerradas = ganadas + resumen.PERDIDO.cuantos;
  if (cerradas === 0) return null;
  return Math.round((ganadas / cerradas) * 100);
}

/** Por donde sale un mensaje programado. */
export type CanalMensaje = "auto" | "whatsapp" | "correo";

export const CANALES_MENSAJE: { key: CanalMensaje; label: string }[] = [
  { key: "auto", label: "Automático" },
  { key: "whatsapp", label: "Solo WhatsApp" },
  { key: "correo", label: "Solo correo" },
];

export function esCanalMensaje(v: unknown): v is CanalMensaje {
  return v === "auto" || v === "whatsapp" || v === "correo";
}

/** Textos listos para no escribir desde cero. Llevan {nombre} y {negocio}. */
export const PLANTILLAS_RAPIDAS: { label: string; texto: string }[] = [
  {
    label: "Recordatorio de pago",
    texto: "Hola {nombre}, te recordamos que tienes un pago pendiente con {negocio}. Si ya pagaste, ignora este mensaje.",
  },
  {
    label: "Recordatorio de cita",
    texto: "Hola {nombre}, te recordamos tu cita con {negocio}. Si no puedes venir, avísanos por aquí.",
  },
  {
    label: "Seguimiento",
    texto: "Hola {nombre}, ¿cómo te fue con lo que compraste en {negocio}? Cualquier cosa, aquí estamos.",
  },
  {
    label: "Promoción",
    texto: "Hola {nombre}, esta semana tenemos una promoción especial en {negocio}. ¡Te esperamos!",
  },
];

export const ESTADOS_MENSAJE: Record<string, { label: string; tone: Tono }> = {
  PENDIENTE: { label: "Programado", tone: "blue" },
  ENVIANDO: { label: "Enviando", tone: "slate" },
  ENVIADO: { label: "Enviado", tone: "green" },
  FALLIDO: { label: "No salió", tone: "red" },
  MANUAL: { label: "Para enviar a mano", tone: "amber" },
  CANCELADO: { label: "Cancelado", tone: "slate" },
};
