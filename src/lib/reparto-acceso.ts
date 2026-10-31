import { notFound } from "next/navigation";
import { requireSession } from "./auth";
import { esAdminDeChopo } from "./chopo";

/**
 * Para cada pagina de Reparto: la sesion, o "no existe" si no es la
 * administradora de Chopo Snacks. El layout ya lo mira, pero una pagina no
 * debe depender de que su layout corra (ver lib/chopo.ts).
 */
export async function sesionDeReparto() {
  const sesion = await requireSession();
  if (!esAdminDeChopo(sesion.user, sesion.staff)) notFound();
  return sesion;
}
