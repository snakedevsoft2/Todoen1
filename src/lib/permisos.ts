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

/** Los negocios que tienen pagina publica para compartir. */
export function tienePaginaPublica(tipo: string): boolean {
  return tipo !== "ASISTENCIA" && tipo !== "CARTERA";
}
