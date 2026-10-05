/**
 * Donde va una firma dentro de un PDF.
 *
 * Se guarda como fraccion de la pagina (0 a 1), contada desde la esquina de
 * arriba a la izquierda tal como se ve en pantalla. Asi el mismo lugar sirve
 * en un celular angosto y en un computador, y en el servidor se convierte a
 * los puntos del PDF (ver firma-pdf.ts). Lo usan el navegador y el servidor.
 */

export type Spot = {
  /** Pagina, empezando en 1. */
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Firmas por documento. Una por pagina en un contrato largo ya es mucho. */
export const MAX_SPOTS = 40;

/** El tamano con que aparece una firma nueva: un renglon de firma comun. */
export const SPOT_NUEVO = { w: 0.32, h: 0.09 };

const MIN_LADO = 0.03;

const entre = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Deja los lugares dentro de la pagina y descarta lo que no tenga forma de
 * lugar. Nunca lanza: lo que llega del navegador puede ser cualquier cosa.
 */
export function normalizarSpots(valor: unknown, paginas: number): Spot[] {
  if (!Array.isArray(valor)) return [];
  const salida: Spot[] = [];
  for (const v of valor.slice(0, MAX_SPOTS)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const page = Math.round(Number(o.page));
    const nums = [o.x, o.y, o.w, o.h].map(Number);
    if (!Number.isFinite(page) || page < 1 || page > paginas || nums.some((n) => !Number.isFinite(n))) continue;
    const w = entre(nums[2], MIN_LADO, 1);
    const h = entre(nums[3], MIN_LADO, 1);
    const x = entre(nums[0], 0, 1 - w);
    const y = entre(nums[1], 0, 1 - h);
    const r = (n: number) => Math.round(n * 10000) / 10000;
    salida.push({ page, x: r(x), y: r(y), w: r(w), h: r(h) });
  }
  return salida;
}

/** Lee lo guardado en la base. Un texto danado vale como "sin lugares". */
export function leerSpots(texto: string | null | undefined, paginas: number): Spot[] {
  if (!texto) return [];
  try {
    return normalizarSpots(JSON.parse(texto), paginas);
  } catch {
    return [];
  }
}

/** Donde poner la firma cuando el negocio no marco ningun lugar: abajo a la derecha de la ultima pagina. */
export function spotPorDefecto(paginas: number): Spot {
  return { page: Math.max(1, paginas), x: 0.6, y: 0.82, w: SPOT_NUEVO.w, h: SPOT_NUEVO.h };
}
