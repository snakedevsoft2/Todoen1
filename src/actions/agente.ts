"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { str, texto } from "@/lib/format";

export type AgenteState = { error?: string; ok?: string } | undefined;

/** Prender o apagar el agente y decirle lo que debe saber. Solo el dueño. */
export async function guardarAgenteAction(_prev: AgenteState, formData: FormData): Promise<AgenteState> {
  const { user } = await requireOwner();

  const data = {
    webOn: formData.get("webOn") === "on",
    whatsappOn: formData.get("whatsappOn") === "on",
    greeting: str(formData.get("greeting"), "", 200) || null,
    notes: texto(formData.get("notes"), 2000) || null,
  };

  // Sin el numero conectado con Meta no hay por donde llegar ni salir un
  // WhatsApp: prenderlo asi seria un interruptor que no hace nada.
  if (data.whatsappOn && (user.whatsappProvider !== "meta" || !user.whatsappApiKey || !user.whatsappPhoneId)) {
    return {
      error: "Para contestar WhatsApp primero conecta tu número con Meta en Personalizar, en Avisos por WhatsApp.",
    };
  }

  await db.agentConfig.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  revalidatePath("/panel/agente");
  revalidatePath("/catalogo/" + user.slug);
  revalidatePath("/reservar/" + user.slug);
  return { ok: "Listo, el agente quedó guardado." };
}
