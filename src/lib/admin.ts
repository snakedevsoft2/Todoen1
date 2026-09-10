import "server-only";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import type { Session } from "@/lib/auth";

/**
 * Quien administra la plataforma.
 *
 * Va en una variable de entorno y no en una columna de la base a proposito:
 * asi no hay ninguna pantalla, ninguna accion y ninguna consulta que pueda
 * volver administrador a nadie. Para dar ese poder hay que entrar al servidor
 * y cambiar la configuracion, que es justo lo que queremos.
 *
 * Se escriben separados por coma:
 *   ADMIN_EMAILS="tucorreo@gmail.com,socio@gmail.com"
 *
 * Si la variable esta vacia, no hay administrador y el panel no existe para
 * nadie. Esa es la posicion segura: sin configurar, nadie entra.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

export function hayAdmin(): boolean {
  return adminEmails().length > 0;
}

/** Si el correo con el que entro esta en la lista. */
export function esAdmin(correo: string | null | undefined): boolean {
  if (!correo) return false;
  return adminEmails().includes(correo.trim().toLowerCase());
}

/**
 * El correo de quien entro.
 *
 * Un empleado entra con el correo de Staff; el dueno del negocio, con el de
 * User. Se mira el de la persona primero porque es el que de verdad tecleo.
 */
export function correoDeLaSesion(sesion: Session): string {
  return sesion.staff.email ?? sesion.user.email;
}

/**
 * Panel de administracion obligatorio.
 *
 * Quien no sea administrador no ve un "no tienes permiso": lo devolvemos a su
 * panel como si la direccion no existiera. No vale la pena confirmarle a nadie
 * que hay una puerta ahi.
 */
export async function requireAdmin(): Promise<Session> {
  const sesion = await getCurrentSession();
  if (!sesion) redirect("/salir");
  if (!esAdmin(correoDeLaSesion(sesion))) redirect("/panel");
  return sesion;
}
