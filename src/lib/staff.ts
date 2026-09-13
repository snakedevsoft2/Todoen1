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
  DUENO: "Dueño",
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
  // Quien sale a la ruta a recoger. Se guarda con el rol VENDEDOR, que es el
  // de empleado sin acceso a la configuracion: lo que cambia es como se llama,
  // no lo que puede hacer.
  CARTERA: { title: "Cobradores", singular: "cobrador", plural: "cobradores", role: "VENDEDOR" },
  ASISTENCIA: { title: "Personal", singular: "empleado", plural: "empleados", role: "VENDEDOR" },
};

/**
 * Como se llama el rol en pantalla, con la palabra de cada negocio.
 *
 * En la base el empleado del gestor de asistencia se guarda como VENDEDOR
 * (es el rol sin acceso a la configuracion), pero ahi nadie vende: tiene que
 * decir "Empleado", y el dueño es el "Administrador".
 */
export function etiquetaDeRol(role: string, businessType: string): string {
  if (role === "DUENO") return businessType === "ASISTENCIA" ? "Administrador" : "Dueño";
  const n = TEAM_NOUN[businessType];
  if (!n) return ROLE_LABEL[role] ?? "Empleado";
  return n.singular.charAt(0).toUpperCase() + n.singular.slice(1);
}

/** Direccion de la foto de perfil, con version para poder cachearla. */
export function fotoPerfil(s: { id: string; photo?: string | null; updatedAt: Date | string }): string | null {
  return s.photo ? "/foto-perfil/" + s.id + "?v=" + new Date(s.updatedAt).getTime() : null;
}

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
