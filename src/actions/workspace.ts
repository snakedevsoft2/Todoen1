"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { str } from "@/lib/format";
import {
  keysDeFabrica,
  modulosDe,
  parseKeys,
  presetKeys,
  type PresetKey,
} from "@/lib/modules";

export type WorkspaceState = { error?: string; ok?: string } | undefined;

function refresh() {
  // El menu vive en el layout, asi que hay que refrescar toda la rama.
  revalidatePath("/panel", "layout");
}

/**
 * Guarda el espacio de trabajo de una persona.
 *
 * Guardamos las dos listas completas, la encendida y la apagada, y no solo una:
 * asi la configuracion deja constancia de que apartados existian el dia que se
 * guardo. Un apartado que se estrene despues no aparece en ninguna de las dos,
 * y por eso puede entrar con lo que traiga de fabrica en vez de quedarse
 * invisible para siempre.
 */
async function guardar(staffId: string, userId: string, hidden: string[], order: string[]) {
  const datos = { hiddenKeys: hidden.join(","), orderKeys: order.join(",") };
  await db.workspaceConfig.upsert({
    where: { staffId },
    create: { staffId, userId, ...datos },
    update: datos,
  });
}

export async function saveWorkspaceAction(
  _prev: WorkspaceState,
  formData: FormData
): Promise<WorkspaceState> {
  const sesion = await requireSession();

  // El catalogo de esta persona es la unica lista valida: lo que llegue por el
  // formulario y no este aqui se ignora, venga de donde venga.
  const modulos = await modulosDe(sesion);
  const validas = new Set(modulos.map((m) => m.key));
  const fijas = new Set(modulos.filter((m) => m.fixed).map((m) => m.key));

  const orden = parseKeys(str(formData.get("order"))).filter((k) => validas.has(k));
  const encendidas = new Set(
    formData.getAll("visible").map(String).filter((k) => validas.has(k))
  );

  const apagadas = modulos
    .map((m) => m.key)
    .filter((k) => !encendidas.has(k) && !fijas.has(k));

  if (apagadas.length === modulos.length) {
    return { error: "Deja al menos un apartado encendido." };
  }

  await guardar(sesion.staff.id, sesion.user.id, apagadas, orden);
  refresh();
  return { ok: "Tu espacio quedo asi." };
}

/** Aplica uno de los arreglos listos sin tocar el orden que la persona eligio. */
export async function applyPresetAction(formData: FormData) {
  const sesion = await requireSession();
  const preset = str(formData.get("preset")) as PresetKey;
  if (preset !== "esencial" && preset !== "fabrica" && preset !== "todo") return;

  const modulos = await modulosDe(sesion);
  const fabrica = await keysDeFabrica(sesion.user.businessType, sesion.staff.role === "DUENO");
  const dejar = new Set(presetKeys(preset, modulos, fabrica));

  const apagadas = modulos.filter((m) => !m.fixed && !dejar.has(m.key)).map((m) => m.key);

  const actual = await db.workspaceConfig.findFirst({
    where: { staffId: sesion.staff.id, userId: sesion.user.id },
    select: { orderKeys: true },
  });

  await guardar(sesion.staff.id, sesion.user.id, apagadas, parseKeys(actual?.orderKeys));
  refresh();
}

/** Volver al menu de fabrica: se borra la configuracion y manda el catalogo. */
export async function resetWorkspaceAction() {
  const { user, staff } = await requireSession();
  await db.workspaceConfig.deleteMany({ where: { staffId: staff.id, userId: user.id } });
  refresh();
}
