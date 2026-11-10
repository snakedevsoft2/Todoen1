import "server-only";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import type { Session } from "@/lib/auth";

import { esAdmin } from "@/lib/admin-correos";

export { adminEmails, esAdmin, hayAdmin } from "@/lib/admin-correos";

/**
 * El correo de quien entro.
 *
 * Un empleado entra con el correo de Staff; el dueno del negocio, con el de
 * User. Se mira el de la persona primero porque es el que de verdad tecleo.
 */
export function correoDeLaSesion(sesion: Session): string {
  // El empleado sin correo (entra con usuario) no hereda el correo del dueño:
  // si el dueño administra la plataforma, su empleado no.
  if (sesion.staff.role !== "DUENO") return sesion.staff.email ?? "";
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
