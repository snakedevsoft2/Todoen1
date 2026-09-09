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
  VENDEDOR: "Vendedor",
};

/**
 * Como se llama el equipo en cada negocio.
 *
 * El modelo es el mismo (Staff), solo cambia la palabra: la barberia tiene
 * barberos con agenda y la tienda de ropa tiene vendedores con comision.
 */
export const TEAM_NOUN: Record<string, { title: string; singular: string; plural: string; role: string }> = {
  BARBERIA: { title: "Barberos", singular: "barbero", plural: "barberos", role: "BARBERO" },
  ROPA: { title: "Empleados", singular: "empleado", plural: "empleados", role: "VENDEDOR" },
};

/** Negocios que trabajan con equipo propio dentro de la aplicacion. */
export function hasTeam(businessType: string): boolean {
  return businessType in TEAM_NOUN;
}

export function teamNoun(businessType: string) {
  return TEAM_NOUN[businessType] ?? TEAM_NOUN.BARBERIA;
}

/** Iniciales para el circulito de color de cada barbero. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
