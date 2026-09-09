"use server";

import { getCurrentSession } from "@/lib/auth";
import { anotarVisita, modulosDe } from "@/lib/modules";

/**
 * Anota que esta persona abrio un apartado.
 *
 * La llave llega del navegador, asi que no se cree: se comprueba contra el
 * catalogo de esta cuenta. Alguien puede mandar la llave que quiera y lo peor
 * que consigue es que no se anote nada.
 *
 * No devuelve nada ni refresca la pantalla: es una anotacion al margen y no
 * debe hacer que la pagina se vuelva a pintar.
 */
export async function registrarVisitaAction(moduleKey: string) {
  const sesion = await getCurrentSession();
  if (!sesion) return;
  if (typeof moduleKey !== "string" || moduleKey.length > 40) return;

  const modulos = await modulosDe(sesion);
  if (!modulos.some((m) => m.key === moduleKey)) return;

  await anotarVisita(sesion.user.id, sesion.staff.id, moduleKey);
}
