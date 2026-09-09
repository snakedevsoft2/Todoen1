"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { str } from "@/lib/format";
import { keysDeFabrica, modulosDe, presetKeys, type PresetKey } from "@/lib/modules";
import { PASOS } from "@/lib/onboarding";

function refresh() {
  revalidatePath("/panel", "layout");
  revalidatePath("/panel/bienvenida");
}

/** Avanzar o devolverse. El paso queda guardado para poder retomarlo. */
export async function goToStepAction(formData: FormData) {
  const { staff } = await requireSession();
  const paso = Math.max(0, Math.min(PASOS - 1, Number(str(formData.get("paso"))) || 0));
  await db.staff.update({ where: { id: staff.id }, data: { onboardingStep: paso } });
  refresh();
}

/**
 * Guarda el arreglo elegido en el paso 2 y avanza.
 *
 * Es el unico paso que escribe configuracion de verdad; los demas solo
 * explican. Por eso guarda las dos listas completas, igual que el
 * configurador, para que un apartado nuevo pueda estrenarse despues.
 */
export async function chooseWorkspaceAction(formData: FormData) {
  const sesion = await requireSession();
  const preset = str(formData.get("preset")) as PresetKey;
  if (preset !== "esencial" && preset !== "fabrica" && preset !== "todo") return;

  const modulos = await modulosDe(sesion);
  const fabrica = await keysDeFabrica(sesion.user.businessType, sesion.staff.role === "DUENO");
  const dejar = new Set(presetKeys(preset, modulos, fabrica));

  const apagadas = modulos.filter((m) => !m.fixed && !dejar.has(m.key)).map((m) => m.key);
  const encendidas = modulos.filter((m) => m.fixed || dejar.has(m.key)).map((m) => m.key);

  const datos = { hiddenKeys: apagadas.join(","), orderKeys: encendidas.join(",") };
  await db.workspaceConfig.upsert({
    where: { staffId: sesion.staff.id },
    create: { staffId: sesion.staff.id, userId: sesion.user.id, ...datos },
    update: datos,
  });

  await db.staff.update({ where: { id: sesion.staff.id }, data: { onboardingStep: 2 } });
  refresh();
}

/**
 * Terminar o saltar.
 *
 * Es lo mismo: en los dos casos la persona ya decidio y no se lo volvemos a
 * poner encima. Siempre lo puede volver a abrir desde Ajustes, y si salta sin
 * elegir nada se queda con el menu de fabrica, que es un punto de partida
 * razonable y no una pantalla vacia.
 */
export async function finishOnboardingAction() {
  const { staff } = await requireSession();
  await db.staff.update({
    where: { id: staff.id },
    data: { onboardingDoneAt: new Date(), onboardingStep: PASOS - 1 },
  });
  refresh();
  redirect("/panel");
}

/** Volver a verlo desde Ajustes. */
export async function restartOnboardingAction() {
  const { staff } = await requireSession();
  await db.staff.update({
    where: { id: staff.id },
    data: { onboardingDoneAt: null, onboardingStep: 0 },
  });
  refresh();
  redirect("/panel/bienvenida");
}
