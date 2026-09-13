"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { str, texto } from "@/lib/format";
import { cuandoAValor, enviarProgramados, programarMensaje } from "@/lib/envios-crm";

export type MensajeState = { error?: string; ok?: string } | undefined;

function refrescar() {
  revalidatePath("/panel/clientes", "layout");
}

/** Programar (o mandar ya) un mensaje a un cliente, desde su ficha. */
export async function programarMensajeAction(_prev: MensajeState, formData: FormData): Promise<MensajeState> {
  const sesion = await requireSession();
  const cuando = cuandoAValor(str(formData.get("cuando")), str(formData.get("fecha")), sesion.user.timezone);
  const r = await programarMensaje(sesion, {
    customerIds: [str(formData.get("customerId"))],
    text: texto(formData.get("text"), 1000),
    channel: str(formData.get("channel")),
    cuando,
  });
  if (!r.ok) return { error: r.error };
  // "Ahora" es ahora: se manda en este momento y la pantalla ya muestra como salio.
  if (r.datos.inmediato) await enviarProgramados({ userId: sesion.user.id, limite: 20 });
  refrescar();
  return { ok: r.datos.inmediato ? "Listo. Abajo ves cómo salió." : "Mensaje programado." };
}

/** Programar el mismo mensaje para todos los clientes de un segmento. */
export async function programarSegmentoAction(
  ids: string[],
  mensaje: string,
  canal: string,
  cuandoIn: string,
  fecha: string
): Promise<{ ok?: string; error?: string }> {
  const sesion = await requireSession();
  const cuando = cuandoAValor(String(cuandoIn ?? ""), String(fecha ?? ""), sesion.user.timezone);
  const r = await programarMensaje(sesion, {
    customerIds: Array.isArray(ids) ? ids.map(String) : [],
    text: String(mensaje ?? "").slice(0, 1000),
    channel: String(canal ?? ""),
    cuando,
  });
  if (!r.ok) return { error: r.error };
  // Con muchos clientes no se hace esperar a la pantalla: sale despues de responder.
  if (r.datos.inmediato) after(() => enviarProgramados({ userId: sesion.user.id, limite: 500 }).then(() => undefined));
  refrescar();
  return {
    ok: (r.datos.inmediato ? "Enviando a " : "Programado para ") + r.datos.creados + (r.datos.creados === 1 ? " cliente." : " clientes."),
  };
}

export async function cancelarMensajeAction(formData: FormData): Promise<void> {
  const { user } = await requireSession();
  await db.scheduledMessage.updateMany({
    where: { id: str(formData.get("id")), userId: user.id, status: { in: ["PENDIENTE", "MANUAL"] } },
    data: { status: "CANCELADO" },
  });
  refrescar();
}

/** Lo mando a mano con el enlace de WhatsApp: queda como enviado y anotado. */
export async function marcarEnviadoAManoAction(id: string): Promise<void> {
  const { user, staff } = await requireSession();
  const m = await db.scheduledMessage.findFirst({
    where: { id: String(id ?? ""), userId: user.id, status: "MANUAL" },
    include: { customer: { select: { id: true, name: true } } },
  });
  if (!m) return;
  await db.scheduledMessage.update({ where: { id: m.id }, data: { status: "ENVIADO", via: "enlace", sentAt: new Date() } });
  await db.interaction.create({
    data: { userId: user.id, customerId: m.customerId, kind: "WHATSAPP", text: m.text, staffId: staff.id, staffName: staff.name },
  });
  await db.customer.update({ where: { id: m.customerId }, data: { lastContactAt: new Date() } });
  refrescar();
}
