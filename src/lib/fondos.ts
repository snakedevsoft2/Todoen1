/**
 * Fondos del portafolio publico.
 *
 * La idea es la de una pagina de pagos: un fondo de un solo color, y el
 * contenido flotando encima en una tarjeta blanca. Se ve ordenado, se ve
 * serio, y el negocio lo hace suyo sin tener que disenar nada.
 *
 * Son colores fijos y no un selector libre, a proposito: con un color libre
 * alguien pone amarillo chillon y la pagina deja de verse profesional. Estos
 * estan elegidos para que la tarjeta blanca siempre resalte.
 *
 * Archivo puro: lo usan igual el catalogo publico y la vista previa del
 * editor, que corre en el navegador.
 */

/** "libre" es un color elegido a mano: se guarda como "color:#1f7a4d". */
export type FondoKey = "claro" | "gris" | "arena" | "menta" | "cielo" | "lavanda" | "oscuro" | "marca" | "foto" | "libre";

export type Fondo = {
  key: FondoKey;
  label: string;
  /** Color del fondo. En "marca" y "foto" se decide con los datos del negocio. */
  color: string | null;
  /** Si el texto de encima del fondo (fuera de la tarjeta) va en blanco. */
  oscuro: boolean;
};

export const FONDOS: Fondo[] = [
  { key: "claro", label: "Clásico", color: null, oscuro: false },
  { key: "gris", label: "Gris", color: "#f2f2f7", oscuro: false },
  { key: "arena", label: "Arena", color: "#f4ede3", oscuro: false },
  { key: "menta", label: "Menta", color: "#e3f2ec", oscuro: false },
  { key: "cielo", label: "Cielo", color: "#e6eefc", oscuro: false },
  { key: "lavanda", label: "Lavanda", color: "#eeeafb", oscuro: false },
  { key: "oscuro", label: "Noche", color: "#111116", oscuro: true },
  { key: "marca", label: "Mi color", color: null, oscuro: true },
  { key: "foto", label: "Mi portada", color: null, oscuro: true },
];

export function esFondo(v: unknown): v is FondoKey {
  return FONDOS.some((f) => f.key === v);
}

const COLOR_LIBRE = /^color:#[0-9a-f]{6}$/i;

/** Un color de fondo elegido a mano, fuera de la lista. */
export function esColorLibre(v: unknown): v is string {
  return typeof v === "string" && COLOR_LIBRE.test(v);
}

/** Lo que se puede guardar como fondo: uno de la lista o un color elegido a mano. */
export function fondoValido(v: unknown): v is string {
  return esFondo(v) || esColorLibre(v);
}

/** Si un color es oscuro: encima el texto va en blanco para que se lea. */
export function esColorOscuro(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const luz = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luz < 0.6;
}

export type FondoResuelto = {
  key: FondoKey;
  /** true: el contenido va dentro de una tarjeta flotante. */
  enTarjeta: boolean;
  color: string;
  oscuro: boolean;
  /** Solo en "foto": la portada que va de fondo. */
  foto: string | null;
};

/**
 * Lo que de verdad se pinta.
 *
 * "Mi portada" sin portada cae a "Mi color": pedir un fondo de foto sin foto
 * no puede dejar la pagina en blanco.
 */
export function resolverFondo(
  key: string | null | undefined,
  brandColor: string,
  cover: string | null | undefined
): FondoResuelto {
  if (esColorLibre(key)) {
    const color = key.slice(6).toLowerCase();
    return { key: "libre", enTarjeta: true, color, oscuro: esColorOscuro(color), foto: null };
  }
  const k: FondoKey = esFondo(key) ? key : "claro";
  const marca = /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : "#5856d6";

  if (k === "claro") return { key: k, enTarjeta: false, color: "", oscuro: false, foto: null };
  if (k === "foto" && cover) return { key: k, enTarjeta: true, color: "#111116", oscuro: true, foto: cover };
  if (k === "marca" || k === "foto") return { key: "marca", enTarjeta: true, color: marca, oscuro: true, foto: null };

  const f = FONDOS.find((x) => x.key === k)!;
  return { key: k, enTarjeta: true, color: f.color ?? "#f2f2f7", oscuro: f.oscuro, foto: null };
}
