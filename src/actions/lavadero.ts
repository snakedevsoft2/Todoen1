"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { parseIntSafe, str } from "@/lib/format";
import { anotarActividad } from "@/lib/actividad";
import { esDueno, esSupervisor, puedeHacer } from "@/lib/permisos-empleado";
import {
  asignarLavador,
  cancelarWashJob,
  cerrarLavado,
  crearWashJob,
  marcarListo,
} from "@/lib/lavadero";
import { avisoDeCercania } from "@/lib/fidelizacion";

export type PatioState = { error?: string; ok?: string; aviso?: string } | undefined;

const VALID_PAYMENTS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];
function readPayment(value: FormDataEntryValue | null): PaymentMethod {
  const v = String(value ?? "EFECTIVO") as PaymentMethod;
  return VALID_PAYMENTS.includes(v) ? v : "EFECTIVO";
}

/** El jefe de patio, o el dueño: los unicos que operan el tablero de patio. */
function esDePatio(role: string): boolean {
  return esDueno(role) || esSupervisor(role);
}

function avisoDeSello(clientName: string, sello: { stamps: number; goal: number; faltan: number; alcanzoMeta: boolean } | null) {
  if (!sello) return undefined;
  return sello.alcanzoMeta
    ? clientName + " completó su tarjeta. ¡Dale su premio!"
    : sello.faltan <= 2
      ? clientName + " lleva " + sello.stamps + " de " + sello.goal + ": le faltan " + sello.faltan + " para el premio."
      : undefined;
}

/** El jefe de patio (o el dueño) recibe un vehiculo que llego al lavadero. */
export async function recibirVehiculoAction(_prev: PatioState, formData: FormData): Promise<PatioState> {
  const { user, staff } = await requireSession();
  if (!esDePatio(staff.role)) return { error: "No tienes permiso para recibir vehículos." };

  const clientName = str(formData.get("clientName"));
  const clientPhone = str(formData.get("clientPhone"), "-");
  if (!clientName) return { error: "Escribe el nombre del cliente." };
  if (clientPhone === "-") return { error: "Escribe el celular del cliente." };

  const job = await crearWashJob(user.id, todayIn(user.timezone), {
    clientName,
    clientPhone,
    vehiclePlate: str(formData.get("vehiclePlate")) || null,
    vehicleType: str(formData.get("vehicleType")) || null,
    vehicleColor: str(formData.get("vehicleColor")) || null,
    serviceId: str(formData.get("serviceId")) || null,
    notes: str(formData.get("notes")) || null,
    receivedById: staff.id,
  });

  const aviso = await avisoDeCercania(db, job.customerId, user.loyaltyGoal);

  await anotarActividad(
    { user, staff },
    {
      tipo: "turno",
      detalle:
        "Recibió el vehículo de " + clientName + (job.vehiclePlate ? " (" + job.vehiclePlate + ")" : ""),
    }
  );

  revalidatePath("/panel/patio");
  return {
    ok: "Vehículo recibido.",
    aviso: aviso
      ? clientName + " lleva " + aviso.stamps + " lavadas: le faltan " + aviso.faltan + " para el premio."
      : undefined,
  };
}

/** Le pone lavador al vehiculo. Eso ya arranca el lavado. */
export async function asignarLavadorAction(formData: FormData) {
  const { user, staff } = await requireSession();
  if (!esDePatio(staff.role)) return;

  const washJobId = str(formData.get("washJobId"));
  const lavadorId = str(formData.get("staffId"));
  const lavador = await db.staff.findFirst({
    where: { id: lavadorId, userId: user.id, active: true, role: { not: "DUENO" } },
  });
  if (!lavador) return;

  await asignarLavador(user.id, washJobId, lavador.id);
  revalidatePath("/panel/patio");
  revalidatePath("/panel/mis-lavados");
}

export async function marcarListoAction(formData: FormData) {
  // El propio lavador puede marcar que ya termino su vehiculo, ademas del
  // jefe de patio y el dueño: por eso lleva lavadorOk.
  const { user, staff } = await requireSession({ lavadorOk: true });
  const washJobId = str(formData.get("washJobId"));
  const job = await db.washJob.findFirst({ where: { id: washJobId, userId: user.id } });
  if (!job) return;
  if (!esDePatio(staff.role) && job.assignedStaffId !== staff.id) return;

  await marcarListo(user.id, washJobId);
  revalidatePath("/panel/patio");
  revalidatePath("/panel/mis-lavados");
}

/** Cobra el lavado: crea la venta, entrega el vehiculo y deja el sello de fidelizacion. */
export async function cerrarLavadoAction(_prev: PatioState, formData: FormData): Promise<PatioState> {
  const { user, staff } = await requireSession();
  if (!esDePatio(staff.role)) return { error: "No tienes permiso para cobrar." };

  const washJobId = str(formData.get("washJobId"));
  const job = await db.washJob.findFirst({ where: { id: washJobId, userId: user.id } });
  if (!job) return { error: "No encontramos ese vehículo." };

  const amount = Math.max(0, parseIntSafe(formData.get("amount"), job.price));
  const resultado = await cerrarLavado(user.id, washJobId, {
    paymentMethod: readPayment(formData.get("paymentMethod")),
    amount,
  });
  if (!resultado) return { error: "Ese lavado ya se cobró o no está listo para cobrarse." };

  await anotarActividad(
    { user, staff },
    { tipo: "cobro", detalle: "Cobró el lavado de " + job.clientName, monto: amount }
  );

  revalidatePath("/panel/patio");
  revalidatePath("/panel/ventas");
  revalidatePath("/panel/mis-lavados");
  revalidatePath("/panel");
  return { ok: "Lavado cobrado.", aviso: avisoDeSello(job.clientName, resultado.sello) };
}

/** Borra un vehiculo del tablero (se equivocaron al recibirlo). Queda en la auditoria del dueño. */
export async function deleteWashJobAction(formData: FormData) {
  const { user, staff } = await requireSession();
  if (!puedeHacer(staff.role, "deleteWashJobAction")) return;

  const id = str(formData.get("id"));
  const job = await db.washJob.findFirst({ where: { id, userId: user.id } });
  if (!job || job.status === "ENTREGADO") return;

  await db.washJob.delete({ where: { id: job.id } });

  await anotarActividad(
    { user, staff },
    { tipo: "borrado", detalle: "Borró el vehículo de " + job.clientName + " del patio" }
  );
  revalidatePath("/panel/patio");
}

/**
 * El jefe de patio recibe un vehiculo que ya tenia reserva publica: crea el
 * WashJob enlazado a esa cita, en vez de pedirle que anote todo otra vez.
 */
export async function recibirDesdeReservaAction(formData: FormData) {
  const { user, staff } = await requireSession();
  if (!esDePatio(staff.role)) return;

  const appointmentId = str(formData.get("appointmentId"));
  const appointment = await db.appointment.findFirst({
    where: { id: appointmentId, userId: user.id, status: { in: ["PENDIENTE", "CONFIRMADO"] } },
    include: { washJob: true },
  });
  if (!appointment || appointment.washJob) return;

  await crearWashJob(user.id, todayIn(user.timezone), {
    clientName: appointment.clientName,
    clientPhone: appointment.clientPhone,
    vehiclePlate: null,
    vehicleType: null,
    vehicleColor: null,
    serviceId: appointment.serviceId,
    notes: appointment.notes,
    receivedById: staff.id,
    appointmentId: appointment.id,
  });
  await db.appointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMADO" } });

  revalidatePath("/panel/patio");
}

/** Cancela un vehiculo sin borrarlo (el cliente se fue, se cambio de idea). */
export async function cancelWashJobAction(formData: FormData) {
  const { user, staff } = await requireSession();
  if (!esDePatio(staff.role)) return;

  const id = str(formData.get("id"));
  await cancelarWashJob(user.id, id);
  revalidatePath("/panel/patio");
}

/** El jefe de patio corrige datos del vehiculo (cliente, placa, servicio) antes de cobrarlo. */
export async function updateWashJobAction(formData: FormData) {
  const { user, staff } = await requireSession();
  if (!puedeHacer(staff.role, "updateWashJobAction")) return;

  const id = str(formData.get("id"));
  const job = await db.washJob.findFirst({ where: { id, userId: user.id } });
  if (!job || job.status === "ENTREGADO") return;

  const serviceId = str(formData.get("serviceId"));
  const service = serviceId ? await db.service.findFirst({ where: { id: serviceId, userId: user.id } }) : null;

  await db.washJob.update({
    where: { id: job.id },
    data: {
      clientName: str(formData.get("clientName"), job.clientName),
      clientPhone: str(formData.get("clientPhone"), job.clientPhone),
      vehiclePlate: str(formData.get("vehiclePlate")) || null,
      vehicleType: str(formData.get("vehicleType")) || null,
      vehicleColor: str(formData.get("vehicleColor")) || null,
      serviceId: service?.id ?? job.serviceId,
      serviceName: service?.name ?? job.serviceName,
      price: service ? service.price : job.price,
      notes: str(formData.get("notes")) || null,
    },
  });

  await anotarActividad(
    { user, staff },
    { tipo: "cambio", detalle: "Cambió los datos del vehículo de " + job.clientName }
  );
  revalidatePath("/panel/patio");
}
