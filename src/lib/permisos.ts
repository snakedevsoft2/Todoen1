import type { NavItem } from "./nav";

/**
 * Lo que puede abrir cada quien, cuando no alcanza con el rol.
 *
 * En el gestor de asistencia el empleado no administra nada: marca su entrada
 * y su salida, avisa sus novedades y hace sus reportes. Ver ventas, el
 * resumen del negocio o la configuracion no le sirve y le confunde, asi que su
 * menu es fijo y cualquier otra direccion lo devuelve a Marcar.
 */

export function esEmpleadoDeAsistencia(
  user: { businessType: string },
  staff: { role: string }
): boolean {
  return user.businessType === "ASISTENCIA" && staff.role !== "DUENO";
}

export const MENU_EMPLEADO_ASISTENCIA: NavItem[] = [
  { href: "/panel/marcar", label: "Marcar", icon: "clock" },
  { href: "/panel/novedades", label: "Novedades", icon: "bell" },
  // Una palabra: el menu de abajo del celular solo muestra la primera.
  { href: "/panel/informes", label: "Reportes", icon: "image" },
  { href: "/panel/escaner", label: "Escáner", icon: "scan" },
  { href: "/panel/perfil", label: "Perfil", icon: "user" },
];

export function rutaDeEmpleadoAsistencia(ruta: string): boolean {
  return MENU_EMPLEADO_ASISTENCIA.some((i) => ruta === i.href || ruta.startsWith(i.href + "/"));
}

/**
 * El lavador (rol VENDEDOR en el lavadero) tampoco ve el negocio completo:
 * solo los vehiculos que le asigno el jefe de patio, cuanto gana por cada
 * uno, y su asistencia. El jefe de patio (SUPERVISOR) no entra aqui: el sigue
 * el menu normal, y lo que no puede ver ya esta resuelto porque esos modulos
 * son ownerOnly (equipo, ajustes, reportes, planilla, sitios).
 */
export function esLavadorDeLavadero(
  user: { businessType: string },
  staff: { role: string }
): boolean {
  return user.businessType === "LAVADERO" && staff.role === "VENDEDOR";
}

export const MENU_LAVADOR: NavItem[] = [
  { href: "/panel/mis-lavados", label: "Mis lavados", icon: "car" },
  { href: "/panel/marcar", label: "Marcar", icon: "clock" },
  { href: "/panel/perfil", label: "Perfil", icon: "user" },
];

export function rutaDeLavador(ruta: string): boolean {
  return MENU_LAVADOR.some((i) => ruta === i.href || ruta.startsWith(i.href + "/"));
}

/** Los negocios que tienen pagina publica para compartir. */
export function tienePaginaPublica(tipo: string): boolean {
  return tipo !== "ASISTENCIA" && tipo !== "CARTERA";
}

/**
 * A donde manda el login apenas entra.
 *
 * Manda directo al destino final (Marcar, Mis lavados) y no a /panel para que
 * ese de ahi redirija otra vez: dos redirecciones seguidas desde una Server
 * Action (login -> /panel -> su pantalla fija) dejan al navegador armando la
 * pagina en dos saltos y a veces la deja en blanco hasta que se recarga a
 * mano. Con un solo salto no pasa.
 */
export function destinoTrasEntrar(user: { businessType: string }, staff: { role: string }): string {
  if (esEmpleadoDeAsistencia(user, staff)) return "/panel/marcar";
  if (esLavadorDeLavadero(user, staff)) return "/panel/mis-lavados";
  return "/panel";
}
