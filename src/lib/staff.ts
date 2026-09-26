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
  SUPERVISOR: "Supervisor",
};

/**
 * Como se llama el rol SUPERVISOR en el negocio que lo usa. Es aparte de
 * TEAM_NOUN porque ese solo tiene espacio para un rol por negocio, y el
 * lavadero necesita dos (lavador y jefe de patio). Ver ROLES_ELEGIBLES.
 */
const SUPERVISOR_LABEL: Record<string, string> = {
  LAVADERO: "Jefe de patio",
};

/**
 * Como se llama el equipo en cada negocio.
 *
 * El modelo es el mismo (Staff), solo cambia la palabra: la barberia tiene
 * barberos con agenda y la tienda de ropa tiene vendedores con comision.
 *
 * Tiene que estar todo negocio al que el catalogo (prisma/modulos.ts) le da el
 * apartado "Empleados", aunque venga apagado de fabrica: si no, el menu lo
 * muestra y la pantalla lo devuelve al inicio. La prueba equipo-tipos lo vigila.
 */
export const TEAM_NOUN: Record<string, { title: string; singular: string; plural: string; role: string }> = {
  BARBERIA: { title: "Barberos", singular: "barbero", plural: "barberos", role: "BARBERO" },
  ROPA: { title: "Empleados", singular: "empleado", plural: "empleados", role: "VENDEDOR" },
  // Quien sale a la ruta a recoger. Se guarda con el rol VENDEDOR, que es el
  // de empleado sin acceso a la configuracion: lo que cambia es como se llama,
  // no lo que puede hacer.
  CARTERA: { title: "Cobradores", singular: "cobrador", plural: "cobradores", role: "VENDEDOR" },
  ASISTENCIA: { title: "Personal", singular: "empleado", plural: "empleados", role: "VENDEDOR" },
  RESTAURANTE: { title: "Empleados", singular: "empleado", plural: "empleados", role: "VENDEDOR" },
  COMIDAS_RAPIDAS: { title: "Empleados", singular: "empleado", plural: "empleados", role: "VENDEDOR" },
  OTRO: { title: "Empleados", singular: "empleado", plural: "empleados", role: "VENDEDOR" },
  LAVADERO: { title: "Lavadores", singular: "lavador", plural: "lavadores", role: "VENDEDOR" },
  DISTRIBUIDORA: { title: "Empleados", singular: "empleado", plural: "empleados", role: "VENDEDOR" },
  SERVICIOS: { title: "Técnicos", singular: "técnico", plural: "técnicos", role: "VENDEDOR" },
};

/** Para un negocio que no esta en la lista: empleado, nunca barbero. */
const EQUIPO_GENERICO = { title: "Empleados", singular: "empleado", plural: "empleados", role: "VENDEDOR" };

/**
 * Los negocios donde se puede elegir el rol al agregar o editar a alguien del
 * equipo, porque tienen mas de uno posible. El resto sigue con un solo rol
 * automatico (el de TEAM_NOUN), sin selector.
 */
export const ROLES_ELEGIBLES: Record<string, { value: string; label: string }[]> = {
  LAVADERO: [
    { value: "VENDEDOR", label: "Lavador" },
    { value: "SUPERVISOR", label: "Jefe de patio" },
  ],
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
  if (role === "SUPERVISOR") return SUPERVISOR_LABEL[businessType] ?? "Supervisor";
  const n = TEAM_NOUN[businessType];
  if (!n) return ROLE_LABEL[role] ?? "Empleado";
  return n.singular.charAt(0).toUpperCase() + n.singular.slice(1);
}

/**
 * Direccion de la foto de perfil, con version para poder cachearla.
 *
 * Acepta `hasPhoto` ademas de `photo` porque lo unico que se necesita saber es
 * si hay foto: quien arma esto desde una consulta debe pedir la presencia y no
 * el data URL. Ver SessionStaff en lib/auth.ts y lib/imagenes.ts.
 */
export function fotoPerfil(s: {
  id: string;
  photo?: string | null;
  hasPhoto?: boolean;
  updatedAt: Date | string;
}): string | null {
  const hay = s.hasPhoto ?? Boolean(s.photo);
  return hay ? "/foto-perfil/" + s.id + "?v=" + new Date(s.updatedAt).getTime() : null;
}

/** Negocios que trabajan con equipo propio dentro de la aplicacion. */
export function hasTeam(businessType: string): boolean {
  return businessType in TEAM_NOUN;
}

export function teamNoun(businessType: string) {
  return TEAM_NOUN[businessType] ?? EQUIPO_GENERICO;
}

/** Iniciales para el circulito de color de cada barbero. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
