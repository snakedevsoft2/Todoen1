"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwner, requireSession } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { parseMoney, str, texto } from "@/lib/format";
import { importarClientes, LIMITE_CLIENTES } from "@/lib/clientes";
import {
  esCerrada,
  esColor,
  esContacto,
  esEtapa,
  esInteraccion,
  llaveTelefono,
} from "@/lib/crm";

export type CrmState = { error?: string; ok?: string } | undefined;

function refrescar(customerId?: string | null) {
  revalidatePath("/panel/clientes", "layout");
  if (customerId) revalidatePath("/panel/clientes/" + customerId);
  revalidatePath("/panel");
}

/** El cliente tiene que ser de este negocio. Devuelve null si no. */
async function clienteDelNegocio(userId: string, id: string) {
  if (!id) return null;
  return db.customer.findFirst({ where: { id, userId }, select: { id: true, name: true } });
}

/** Lo mismo para la persona del equipo a quien se le asigna algo. */
async function personaDelNegocio(userId: string, id: string) {
  if (!id) return null;
  return db.staff.findFirst({ where: { id, userId, active: true }, select: { id: true } });
}

// ------------------------------------------------------------- CLIENTES

/**
 * Crea o edita la ficha.
 *
 * Todo el equipo puede: quien atiende es quien conoce al cliente. Borrar si es
 * solo del dueno.
 */
export async function guardarClienteAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const { user } = await requireSession();
  const id = str(formData.get("id"));

  const name = str(formData.get("name"));
  if (!name) return { error: "Escribe el nombre del cliente." };

  const phone = str(formData.get("phone"), "", 40) || null;
  if (phone && !llaveTelefono(phone)) return { error: "Ese teléfono está incompleto." };
  const phoneKey = llaveTelefono(phone);

  const email = str(formData.get("email"), "", 120).toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Ese correo no parece válido." };
  }

  const data = {
    name,
    phone,
    phoneKey,
    email,
    document: str(formData.get("document"), "", 40) || null,
    address: str(formData.get("address")) || null,
    notes: texto(formData.get("notes")) || null,
  };

  // Mejor decirlo que dejar dos fichas de la misma persona.
  if (phoneKey) {
    const otro = await db.customer.findFirst({
      where: { userId: user.id, phoneKey, ...(id ? { NOT: { id } } : {}) },
      select: { name: true },
    });
    if (otro) return { error: "Ya tienes a " + otro.name + " con ese teléfono." };
  }

  if (id) {
    const r = await db.customer.updateMany({ where: { id, userId: user.id }, data });
    if (r.count === 0) return { error: "No encontramos ese cliente." };
    refrescar(id);
    return { ok: "Cambios guardados." };
  }

  const cuantos = await db.customer.count({ where: { userId: user.id } });
  if (cuantos >= LIMITE_CLIENTES) return { error: "Llegaste al máximo de clientes." };

  const nuevo = await db.customer.create({ data: { ...data, userId: user.id, source: "manual" } });
  refrescar();
  redirect("/panel/clientes/" + nuevo.id);
}

export async function borrarClienteAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  await db.customer.deleteMany({ where: { id, userId: user.id } });
  refrescar();
  redirect("/panel/clientes");
}

export async function importarClientesAction(_prev: CrmState): Promise<CrmState> {
  const { user } = await requireOwner();
  const { creados, revisados } = await importarClientes(user.id);
  refrescar();
  if (revisados === 0) return { ok: "Todavía no hay clientes anotados en otros apartados." };
  if (creados === 0) return { ok: "Ya estaban todos. No había clientes nuevos que traer." };
  return { ok: "Listo: " + creados + (creados === 1 ? " cliente nuevo." : " clientes nuevos.") };
}

// ------------------------------------------------------------ ETIQUETAS

export async function crearEtiquetaAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const { user } = await requireSession();
  const name = str(formData.get("name"), "", 30);
  if (!name) return { error: "Escribe el nombre de la etiqueta." };
  const colorIn = str(formData.get("color"));
  const color = esColor(colorIn) ? colorIn : "#2563eb";

  const cuantas = await db.customerTag.count({ where: { userId: user.id } });
  if (cuantas >= 100) return { error: "Puedes tener hasta 100 etiquetas." };

  const existente = await db.customerTag.findFirst({
    where: { userId: user.id, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  const tag = existente ?? (await db.customerTag.create({ data: { userId: user.id, name, color } }));

  // Si se creo desde la ficha, queda puesta de una vez.
  const customerId = str(formData.get("customerId"));
  const cliente = await clienteDelNegocio(user.id, customerId);
  if (cliente) {
    await db.customerTagLink.upsert({
      where: { customerId_tagId: { customerId: cliente.id, tagId: tag.id } },
      create: { customerId: cliente.id, tagId: tag.id, userId: user.id },
      update: {},
    });
  }

  refrescar(cliente?.id);
  return { ok: existente ? "Esa etiqueta ya existía." : "Etiqueta creada." };
}

/** Pone o quita una etiqueta. */
export async function alternarEtiquetaAction(formData: FormData) {
  const { user } = await requireSession();
  const [cliente, tag] = await Promise.all([
    clienteDelNegocio(user.id, str(formData.get("customerId"))),
    db.customerTag.findFirst({ where: { id: str(formData.get("tagId")), userId: user.id }, select: { id: true } }),
  ]);
  if (!cliente || !tag) return;

  const llave = { customerId_tagId: { customerId: cliente.id, tagId: tag.id } };
  const puesta = await db.customerTagLink.findUnique({ where: llave });
  if (puesta) await db.customerTagLink.delete({ where: llave });
  else await db.customerTagLink.create({ data: { customerId: cliente.id, tagId: tag.id, userId: user.id } });
  refrescar(cliente.id);
}

export async function borrarEtiquetaAction(formData: FormData) {
  const { user } = await requireOwner();
  await db.customerTag.deleteMany({ where: { id: str(formData.get("id")), userId: user.id } });
  refrescar();
}

// -------------------------------------------------------- INTERACCIONES

export async function anotarInteraccionAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const { user, staff } = await requireSession();
  const cliente = await clienteDelNegocio(user.id, str(formData.get("customerId")));
  if (!cliente) return { error: "No encontramos ese cliente." };

  const kind = str(formData.get("kind"));
  if (!esInteraccion(kind)) return { error: "Elige qué pasó." };
  const text = texto(formData.get("text"));
  if (!text) return { error: "Escribe qué pasó." };

  await db.interaction.create({
    data: { userId: user.id, customerId: cliente.id, kind, text, staffId: staff.id, staffName: staff.name },
  });
  if (esContacto(kind)) {
    await db.customer.update({ where: { id: cliente.id }, data: { lastContactAt: new Date() } });
  }
  refrescar(cliente.id);
  return { ok: "Anotado." };
}

/**
 * Deja constancia de un WhatsApp mandado desde Segmentos.
 *
 * Se llama al tocar el enlace, sin esperar respuesta: si falla, el mensaje
 * igual sale, que es lo que importa.
 */
export async function registrarEnvioAction(customerId: string, mensaje: string): Promise<void> {
  const { user, staff } = await requireSession();
  const cliente = await clienteDelNegocio(user.id, String(customerId ?? ""));
  if (!cliente) return;
  const text = String(mensaje ?? "").trim().slice(0, 2000);
  if (!text) return;
  await db.interaction.create({
    data: {
      userId: user.id,
      customerId: cliente.id,
      kind: "WHATSAPP",
      text,
      staffId: staff.id,
      staffName: staff.name,
    },
  });
  await db.customer.update({ where: { id: cliente.id }, data: { lastContactAt: new Date() } });
}

export async function borrarInteraccionAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const fila = await db.interaction.findFirst({ where: { id, userId: user.id }, select: { customerId: true } });
  if (!fila) return;
  await db.interaction.delete({ where: { id } });
  refrescar(fila.customerId);
}

// -------------------------------------------------------- OPORTUNIDADES

export async function guardarOportunidadAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const { user, staff: yo } = await requireSession();
  const id = str(formData.get("id"));

  const title = str(formData.get("title"));
  if (!title) return { error: "Escribe qué le quieres vender." };

  const stage = str(formData.get("stage")) || "NUEVO";
  if (!esEtapa(stage)) return { error: "Elige en qué va." };

  const value = parseMoney(formData.get("value"), user.currency);

  const expectedIn = str(formData.get("expectedDay"));
  if (expectedIn && !isValidDay(expectedIn)) return { error: "La fecha de cierre no es válida." };

  const staffIn = str(formData.get("staffId"));
  const persona = staffIn ? await personaDelNegocio(user.id, staffIn) : null;
  if (staffIn && !persona) return { error: "Elige a alguien del equipo." };

  const data = {
    title,
    value,
    stage,
    expectedDay: expectedIn || null,
    staffId: persona?.id ?? null,
    lostReason: stage === "PERDIDO" ? str(formData.get("lostReason")) || null : null,
  };

  if (id) {
    const actual = await db.deal.findFirst({ where: { id, userId: user.id }, select: { stage: true, customerId: true } });
    if (!actual) return { error: "No encontramos esa oportunidad." };
    await db.deal.update({
      where: { id },
      data: {
        ...data,
        // Solo cambia la fecha de cierre cuando cambia de abierta a cerrada o al reves.
        ...(esCerrada(stage) !== esCerrada(actual.stage) ? { closedAt: esCerrada(stage) ? new Date() : null } : {}),
      },
    });
    refrescar(actual.customerId);
    return { ok: "Oportunidad guardada." };
  }

  const cliente = await clienteDelNegocio(user.id, str(formData.get("customerId")));
  if (!cliente) return { error: "Elige el cliente." };

  const abiertas = await db.deal.count({ where: { userId: user.id, closedAt: null } });
  if (abiertas >= 2000) return { error: "Tienes demasiadas oportunidades abiertas. Cierra algunas." };

  await db.deal.create({
    data: {
      ...data,
      staffId: data.staffId ?? yo.id,
      userId: user.id,
      customerId: cliente.id,
      closedAt: esCerrada(stage) ? new Date() : null,
    },
  });
  refrescar(cliente.id);
  return { ok: "Oportunidad agregada." };
}

/** Lo llama el tablero al soltar una tarjeta en otra columna. */
export async function moverOportunidadAction(
  id: string,
  etapa: string
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireSession();
  if (!esEtapa(etapa)) return { ok: false, error: "Esa columna no existe." };

  const actual = await db.deal.findFirst({
    where: { id: String(id ?? ""), userId: user.id },
    select: { id: true, stage: true, customerId: true },
  });
  if (!actual) return { ok: false, error: "No encontramos esa oportunidad." };
  if (actual.stage === etapa) return { ok: true };

  await db.deal.update({
    where: { id: actual.id },
    data: {
      stage: etapa,
      ...(esCerrada(etapa) !== esCerrada(actual.stage) ? { closedAt: esCerrada(etapa) ? new Date() : null } : {}),
      ...(etapa !== "PERDIDO" ? { lostReason: null } : {}),
    },
  });
  refrescar(actual.customerId);
  return { ok: true };
}

export async function borrarOportunidadAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const deal = await db.deal.findFirst({ where: { id, userId: user.id }, select: { customerId: true } });
  if (!deal) return;
  await db.deal.delete({ where: { id } });
  refrescar(deal.customerId);
}

// -------------------------------------------------------- SEGUIMIENTOS

export async function crearSeguimientoAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const { user, staff: yo } = await requireSession();

  const title = str(formData.get("title"));
  if (!title) return { error: "Escribe qué hay que hacer." };

  const dayIn = str(formData.get("dueDay"));
  if (dayIn && !isValidDay(dayIn)) return { error: "La fecha no es válida." };
  const dueDay = dayIn || todayIn(user.timezone);

  const timeIn = str(formData.get("dueTime"));
  if (timeIn && !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeIn)) return { error: "La hora no es válida." };

  const customerIn = str(formData.get("customerId"));
  const cliente = customerIn ? await clienteDelNegocio(user.id, customerIn) : null;
  if (customerIn && !cliente) return { error: "Ese cliente no existe." };

  const dealIn = str(formData.get("dealId"));
  const deal = dealIn
    ? await db.deal.findFirst({ where: { id: dealIn, userId: user.id }, select: { id: true, customerId: true } })
    : null;
  if (dealIn && !deal) return { error: "Esa oportunidad no existe." };

  const staffIn = str(formData.get("staffId"));
  const persona = staffIn ? await personaDelNegocio(user.id, staffIn) : null;
  if (staffIn && !persona) return { error: "Elige a alguien del equipo." };

  const pendientes = await db.followUp.count({ where: { userId: user.id, doneAt: null } });
  if (pendientes >= 5000) return { error: "Tienes demasiados seguimientos pendientes." };

  await db.followUp.create({
    data: {
      userId: user.id,
      title,
      dueDay,
      dueTime: timeIn || null,
      customerId: cliente?.id ?? deal?.customerId ?? null,
      dealId: deal?.id ?? null,
      staffId: persona?.id ?? yo.id,
      createdById: yo.id,
    },
  });
  refrescar(cliente?.id ?? deal?.customerId);
  return { ok: "Seguimiento agendado." };
}

/** Lo marca hecho, o lo vuelve a abrir si ya estaba hecho. */
export async function completarSeguimientoAction(formData: FormData) {
  const { user } = await requireSession();
  const id = str(formData.get("id"));
  const s = await db.followUp.findFirst({ where: { id, userId: user.id }, select: { doneAt: true, customerId: true } });
  if (!s) return;
  await db.followUp.update({ where: { id }, data: { doneAt: s.doneAt ? null : new Date() } });
  refrescar(s.customerId);
}

/** Lo borra el dueno, quien lo creo o a quien se lo asignaron. */
export async function borrarSeguimientoAction(formData: FormData) {
  const { user, staff } = await requireSession();
  const id = str(formData.get("id"));
  const s = await db.followUp.findFirst({
    where: { id, userId: user.id },
    select: { customerId: true, staffId: true, createdById: true },
  });
  if (!s) return;
  const puede = staff.role === "DUENO" || s.staffId === staff.id || s.createdById === staff.id;
  if (!puede) return;
  await db.followUp.delete({ where: { id } });
  refrescar(s.customerId);
}
