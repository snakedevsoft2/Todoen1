"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { str } from "@/lib/format";

/**
 * Ubicacion que el propio deudor comparte, a proposito, desde un enlace
 * publico sin cuenta ni clave (/ubicacion/[id]).
 *
 * No hay sesion aqui: el "token" es el id de la deuda, que no se muestra en
 * ningun listado publico y funciona como el resto de enlaces de esta
 * aplicacion (igual que /reservar/[slug] no pide cuenta). Cualquiera con el
 * enlace puede marcar o quitar su propia ubicacion, que es justo lo que se
 * quiere: control total del deudor sobre su dato, sin depender de que alguien
 * mas se lo administre.
 *
 * A proposito NO existe ninguna accion que la prenda sin que el deudor la
 * pida, ni que la deje sin poder apagarla: eso es lo que separa esto de un
 * rastreo escondido.
 */

export type UbicacionState = { error?: string; ok?: string } | undefined;

const LAT_VALIDA = (n: number) => Number.isFinite(n) && n >= -90 && n <= 90;
const LNG_VALIDA = (n: number) => Number.isFinite(n) && n >= -180 && n <= 180;

export async function compartirUbicacionDeudorAction(
  _prev: UbicacionState,
  formData: FormData
): Promise<UbicacionState> {
  const debtId = str(formData.get("debtId"));
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));

  if (!LAT_VALIDA(lat) || !LNG_VALIDA(lng)) {
    return { error: "No pudimos leer tu ubicación. Intenta de nuevo." };
  }

  const deuda = await db.debt.findUnique({ where: { id: debtId }, select: { id: true, locationConsentAt: true } });
  if (!deuda) return { error: "No encontramos este enlace." };

  await db.debt.update({
    where: { id: deuda.id },
    data: {
      // La primera vez queda la fecha en que acepto. Si vuelve a compartir
      // despues, esa fecha no se pierde: sigue siendo desde cuando acepto.
      locationConsentAt: deuda.locationConsentAt ?? new Date(),
      lastLat: lat,
      lastLng: lng,
      lastLocationAt: new Date(),
    },
  });

  revalidatePath("/ubicacion/" + debtId);
  return { ok: "Listo, tu ubicación quedó compartida." };
}

/** El deudor deja de compartir cuando quiera: se borra todo, no solo se apaga un aviso. */
export async function dejarDeCompartirDeudorAction(
  _prev: UbicacionState,
  formData: FormData
): Promise<UbicacionState> {
  const debtId = str(formData.get("debtId"));
  const deuda = await db.debt.findUnique({ where: { id: debtId }, select: { id: true } });
  if (!deuda) return { error: "No encontramos este enlace." };

  await db.debt.update({
    where: { id: deuda.id },
    data: { locationConsentAt: null, lastLat: null, lastLng: null, lastLocationAt: null },
  });

  revalidatePath("/ubicacion/" + debtId);
  return { ok: "Dejaste de compartir tu ubicación." };
}
