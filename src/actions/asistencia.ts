"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner, requireSession } from "@/lib/auth";
import { parseIntSafe, str, texto } from "@/lib/format";

export type AsistenciaState = { error?: string; ok?: string } | undefined;

function refrescar() {
  revalidatePath("/panel/planilla");
  revalidatePath("/panel/sitios");
  revalidatePath("/panel/marcar");
}

/** Un sitio de trabajo: una sede, un edificio, una obra. */
export async function guardarSitioAction(
  _prev: AsistenciaState,
  formData: FormData
): Promise<AsistenciaState> {
  const { user } = await requireOwner();

  const id = str(formData.get("id"));
  const name = str(formData.get("name"));
  if (!name) return { error: "Escribe el nombre del sitio." };

  const address = str(formData.get("address"), "", 300) || null;

  // Las coordenadas son opcionales: un sitio sin ubicacion sigue sirviendo
  // para agrupar, solo que no se puede medir a que distancia marco cada quien.
  const latRaw = str(formData.get("lat"));
  const lngRaw = str(formData.get("lng"));
  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;

  if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
    return { error: "La latitud no es valida." };
  }
  if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
    return { error: "La longitud no es valida." };
  }

  // Un radio muy chico deja a todo el mundo "lejos" por la imprecision normal
  // del GPS de un telefono, que en la calle anda entre 10 y 50 metros.
  const radiusM = Math.min(5000, Math.max(30, parseIntSafe(formData.get("radiusM"), 150)));

  const datos = { name, address, lat, lng, radiusM };

  if (id) {
    // El sitio tiene que ser de esta cuenta.
    const existe = await db.workSite.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!existe) return { error: "Ese sitio no existe." };
    await db.workSite.update({ where: { id }, data: datos });
  } else {
    await db.workSite.create({ data: { ...datos, userId: user.id } });
  }

  refrescar();
  return { ok: id ? "Sitio actualizado." : "Sitio agregado." };
}

export async function alternarSitioAction(formData: FormData): Promise<void> {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const sitio = await db.workSite.findFirst({
    where: { id, userId: user.id },
    select: { id: true, active: true },
  });
  if (!sitio) return;
  await db.workSite.update({ where: { id: sitio.id }, data: { active: !sitio.active } });
  refrescar();
}

/**
 * Anular un marcaje.
 *
 * No lo borra ni lo edita: lo tacha y guarda por que. El original queda a la
 * vista junto a su anulacion, como en un libro contable. Es lo que hace que
 * este registro sirva de prueba: si se pudiera cambiar la hora despues, no
 * probaria nada.
 *
 * Solo el dueno. El empleado no puede tocar lo que marco, que es justamente el
 * punto.
 */
export async function anularMarcajeAction(
  _prev: AsistenciaState,
  formData: FormData
): Promise<AsistenciaState> {
  const { user, staff } = await requireOwner();

  const id = str(formData.get("id"));
  const motivo = texto(formData.get("reason"), 300);
  if (!motivo) return { error: "Escribe por que lo anulas. Sin motivo no queda constancia." };

  const marcaje = await db.attendance.findFirst({
    where: { id, userId: user.id },
    select: { id: true, voidedAt: true },
  });
  if (!marcaje) return { error: "Ese marcaje no existe." };
  if (marcaje.voidedAt) return { error: "Ese marcaje ya estaba anulado." };

  await db.attendance.update({
    where: { id: marcaje.id },
    data: { voidedAt: new Date(), voidedReason: motivo, voidedByStaffId: staff.id },
  });

  refrescar();
  return { ok: "Marcaje anulado. Queda el original con el motivo." };
}

/**
 * Marcar desde el servidor, para cuando la persona esta frente al dueno.
 *
 * Es la salida para el que perdio el telefono o no tiene uno. No lleva
 * ubicacion, y eso queda a la vista en la planilla: un marcaje sin coordenada
 * se distingue de uno hecho en el sitio.
 */
export async function marcarAManoAction(
  _prev: AsistenciaState,
  formData: FormData
): Promise<AsistenciaState> {
  const { user } = await requireOwner();

  const staffId = str(formData.get("staffId"));
  const kind = str(formData.get("kind"));
  if (kind !== "ENTRADA" && kind !== "SALIDA") return { error: "Elige entrada o salida." };

  const persona = await db.staff.findFirst({
    where: { id: staffId, userId: user.id, active: true },
    select: { id: true, name: true },
  });
  if (!persona) return { error: "Esa persona no esta en tu equipo." };

  await db.attendance.create({
    data: {
      userId: user.id,
      staffId: persona.id,
      kind,
      markedAt: new Date(),
      clientKey: "manual-" + crypto.randomUUID(),
      note: "Marcado por el dueno",
    },
  });

  refrescar();
  return { ok: persona.name + ": " + (kind === "ENTRADA" ? "entrada" : "salida") + " registrada." };
}

/** Para la pantalla del empleado: saber si sigue habiendo sesion. */
export async function pingSesionAction(): Promise<boolean> {
  const s = await requireSession();
  return Boolean(s);
}
