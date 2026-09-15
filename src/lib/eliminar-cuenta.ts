import { db } from "./db";

/**
 * Eliminar una cuenta de la plataforma, para siempre.
 *
 * Suspender cierra la puerta y deja todo; esto bota la casa: la cuenta, su
 * equipo y todo lo que registro (ventas, facturas, clientes, inventario,
 * fotos). No se puede deshacer, asi que pide tres cosas:
 *   - escribir el nombre del negocio,
 *   - que no sea la cuenta de quien la elimina,
 *   - que no sea una cuenta de administrador: esa se quita primero de
 *     ADMIN_EMAILS, que es donde se decide quien administra.
 *
 * Todo lo de la cuenta se borra en cascada en la misma operacion, incluidas
 * las ventas con factura autorizada (la factura sigue existiendo ante la DIAN
 * o el SRI y en el proveedor).
 */

export type ResultadoEliminar = { ok: true; businessName: string } | { ok: false; error: string };

const normalizar = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function confirmaNombre(escrito: string, businessName: string): boolean {
  return normalizar(escrito) !== "" && normalizar(escrito) === normalizar(businessName);
}

export async function eliminarCuenta(p: {
  userId: string;
  /** Lo que escribio el administrador: tiene que ser el nombre del negocio. */
  confirmacion: string;
  /** Quien la elimina: no puede eliminar su propia cuenta. */
  adminUserId: string;
  /** Si un correo es de administrador. Viene de lib/admin, que solo corre dentro de Next. */
  esAdmin: (correo: string) => boolean;
}): Promise<ResultadoEliminar> {
  const cuenta = await db.user.findUnique({
    where: { id: p.userId },
    select: { id: true, businessName: true, email: true, staff: { select: { email: true } } },
  });
  if (!cuenta) return { ok: false, error: "Esa cuenta ya no existe." };
  if (cuenta.id === p.adminUserId) return { ok: false, error: "No puedes eliminar tu propia cuenta." };

  const correos = [cuenta.email, ...cuenta.staff.map((s) => s.email)].filter((c): c is string => Boolean(c));
  if (correos.some((c) => p.esAdmin(c))) {
    return { ok: false, error: "Es una cuenta de administrador. Quita su correo de ADMIN_EMAILS antes de eliminarla." };
  }
  if (!confirmaNombre(p.confirmacion, cuenta.businessName)) {
    return { ok: false, error: "Escribe el nombre del negocio tal cual para confirmar." };
  }

  try {
    await db.user.delete({ where: { id: cuenta.id } });
  } catch {
    // Dos administradores a la vez: el otro ya la elimino.
    const sigue = await db.user.count({ where: { id: cuenta.id } });
    if (sigue === 0) return { ok: true, businessName: cuenta.businessName };
    return { ok: false, error: "No se pudo eliminar la cuenta. Inténtalo otra vez." };
  }
  return { ok: true, businessName: cuenta.businessName };
}
