/**
 * Ayudas del equipo del negocio (los barberos).
 *
 * Vive aparte de las acciones porque tambien lo usan los componentes del
 * navegador, y un archivo "use server" solo puede exportar funciones.
 */

/** Colores sugeridos para diferenciar a cada barbero en la agenda. */
export const STAFF_COLORS = [
  "#0ea5e9",
  "#16a34a",
  "#f97316",
  "#a855f7",
  "#e11d48",
  "#0d9488",
  "#ca8a04",
  "#64748b",
];

export const ROLE_LABEL: Record<string, string> = {
  DUENO: "Dueno",
  BARBERO: "Barbero",
};

/** Iniciales para el circulito de color de cada barbero. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
