"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOwner, requireSession } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { money, parseIntSafe, parseMoney, str } from "@/lib/format";
import { anotarActividad } from "@/lib/actividad";
import { esDueno, puedeHacer } from "@/lib/permisos-empleado";
import { anularTicket, ingresarVehiculo, registrarSalida, validarTarifa, tieneParqueadero } from "@/lib/parqueadero";
import { FRACCIONES, numeroTicket } from "@/lib/parqueadero-tarifa";

export type ParqueaderoState = { error?: string; ok?: string } | undefined;

const PAGOS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];

function revalidar(ticketId?: string) {
  revalidatePath("/panel/parqueadero");
  if (ticketId) revalidatePath("/panel/parqueadero/" + ticketId);
  revalidatePath("/panel");
}

/** Entra un vehiculo: solo la placa y el tipo. Telefono, correo y puesto son opcionales. */
export async function ingresarVehiculoAction(_prev: ParqueaderoState, formData: FormData): Promise<ParqueaderoState> {
  const { user, staff } = await requireSession();
  if (!tieneParqueadero(user.businessType)) return { error: "Tu negocio no tiene parqueadero." };

  const email = str(formData.get("email"), "", 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Ese correo no parece válido." };

  const r = await ingresarVehiculo(user.id, todayIn(user.timezone), {
    plate: str(formData.get("plate"), "", 20),
    rateId: str(formData.get("rateId")),
    phone: str(formData.get("phone"), "", 40) || null,
    email: email || null,
    spot: str(formData.get("spot"), "", 60) || null,
    receivedById: staff.id,
  });
  if (!r.ok) return { error: r.error };

  await anotarActividad(
    { user, staff },
    { tipo: "turno", detalle: "Ingresó el vehículo " + r.ticket.plate + " (ticket " + numeroTicket(r.ticket.seq) + ")" }
  );
  revalidar();
  // Directo al ticket: es donde se imprime o se manda por WhatsApp.
  redirect("/panel/parqueadero/" + r.ticket.id + "?nuevo=1");
}

/**
 * Sale el vehiculo (o paga el que ya habia salido debiendo). El valor lo pone
 * la tarifa; solo el dueño puede cambiarlo, por ejemplo para un descuento.
 */
export async function registrarSalidaAction(_prev: ParqueaderoState, formData: FormData): Promise<ParqueaderoState> {
  const { user, staff } = await requireSession();
  const ticketId = str(formData.get("ticketId"));
  const metodo = str(formData.get("paymentMethod"), "EFECTIVO");
  const paymentMethod = metodo === "PENDIENTE" ? "PENDIENTE" : PAGOS.includes(metodo as PaymentMethod) ? (metodo as PaymentMethod) : "EFECTIVO";

  const amountRaw = esDueno(staff.role) ? str(formData.get("amount")) : "";
  // Sin completar ceros: en un parqueadero si hay cobros de $500 o $800.
  const amount = amountRaw ? parseMoney(amountRaw, user.currency) : null;

  const r = await registrarSalida(user.id, ticketId, {
    paymentMethod,
    amount,
    day: todayIn(user.timezone),
    staffId: staff.id,
  });
  if (!r.ok) return { error: r.error };

  const ticket = await db.parkingTicket.findFirst({ where: { id: ticketId, userId: user.id }, select: { plate: true } });
  await anotarActividad(
    { user, staff },
    {
      tipo: "cobro",
      detalle: r.pendiente
        ? "Dejó salir sin pagar el vehículo " + (ticket?.plate ?? "")
        : "Cobró el parqueadero de " + (ticket?.plate ?? ""),
      monto: r.amount,
    }
  );
  revalidar(ticketId);
  revalidatePath("/panel/ventas");
  return {
    ok: r.pendiente
      ? "Salió debiendo " + money(r.amount, user.currency) + ". Quedó en pendientes por pagar."
      : "Cobrado " + money(r.amount, user.currency) + ".",
  };
}

/** Anula un ticket que se ingreso por error. Solo el dueño. */
export async function anularTicketAction(formData: FormData): Promise<void> {
  const { user, staff } = await requireSession();
  if (!puedeHacer(staff.role, "anularTicketAction")) return;
  const id = str(formData.get("ticketId"));
  const ticket = await db.parkingTicket.findFirst({ where: { id, userId: user.id }, select: { plate: true, seq: true } });
  if (!ticket) return;
  if (await anularTicket(user.id, id)) {
    await anotarActividad(
      { user, staff },
      { tipo: "borrado", detalle: "Anuló el ticket " + numeroTicket(ticket.seq) + " de " + ticket.plate }
    );
  }
  revalidar(id);
}

/** Crea o cambia una tarifa. Los vehiculos que ya estan adentro siguen con la de su ticket. */
export async function guardarTarifaAction(_prev: ParqueaderoState, formData: FormData): Promise<ParqueaderoState> {
  const { user } = await requireOwner();

  const id = str(formData.get("id"));
  const fraccion = parseIntSafe(formData.get("fractionMinutes"), 60);
  const datos = {
    name: str(formData.get("name"), "", 40),
    pricePerHour: parseMoney(str(formData.get("pricePerHour")), user.currency),
    fractionMinutes: FRACCIONES.some((f) => f.value === fraccion) ? fraccion : 60,
    graceMinutes: parseIntSafe(formData.get("graceMinutes"), 0),
    pricePerDay: parseMoney(str(formData.get("pricePerDay")), user.currency),
  };
  const error = validarTarifa(datos);
  if (error) return { error };

  const mismoNombre = await db.parkingRate.findFirst({
    where: { userId: user.id, name: { equals: datos.name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (mismoNombre) return { error: "Ya tienes una tarifa para " + datos.name + "." };

  if (id) {
    const r = await db.parkingRate.updateMany({ where: { id, userId: user.id }, data: datos });
    if (r.count === 0) return { error: "No encontramos esa tarifa." };
  } else {
    const cuantas = await db.parkingRate.count({ where: { userId: user.id } });
    if (cuantas >= 30) return { error: "Ya tienes muchas tarifas. Apaga o cambia alguna." };
    await db.parkingRate.create({ data: { userId: user.id, ...datos, sortOrder: cuantas } });
  }
  revalidatePath("/panel/parqueadero/tarifas");
  revalidatePath("/panel/parqueadero");
  return { ok: id ? "Tarifa actualizada." : "Tarifa agregada." };
}

/** Apaga o prende una tarifa: la apagada no sale al ingresar vehiculos. */
export async function alternarTarifaAction(formData: FormData): Promise<void> {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const rate = await db.parkingRate.findFirst({ where: { id, userId: user.id }, select: { active: true } });
  if (!rate) return;
  await db.parkingRate.update({ where: { id }, data: { active: !rate.active } });
  revalidatePath("/panel/parqueadero/tarifas");
  revalidatePath("/panel/parqueadero");
}
