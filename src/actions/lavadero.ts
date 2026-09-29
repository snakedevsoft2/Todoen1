"use server";

import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { parseIntSafe, parseMoney, str } from "@/lib/format";
import { anotarActividad } from "@/lib/actividad";
import { esDueno, esSupervisor, puedeHacer } from "@/lib/permisos-empleado";
import {
  asignarLavador,
  cancelarWashJob,
  cerrarLavado,
  crearWashJob,
  dejarPendienteDePago,
  marcarListo,
} from "@/lib/lavadero";
import { avisoDeCercania } from "@/lib/fidelizacion";
import { entregarTurno, inicioDelTurno, recibirEntrega } from "@/lib/patio-turno";

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

  // Vacio: se usa el precio del catalogo. Con algo escrito, ese manda (se
  // vendio mas barato o mas caro que de costumbre).
  const priceRaw = str(formData.get("price"));
  const price = priceRaw ? Math.max(0, parseIntSafe(formData.get("price"), 0)) : null;

  const job = await crearWashJob(user.id, todayIn(user.timezone), {
    clientName,
    clientPhone,
    vehiclePlate: str(formData.get("vehiclePlate")) || null,
    vehicleType: str(formData.get("vehicleType")) || null,
    vehicleColor: str(formData.get("vehicleColor")) || null,
    serviceId: str(formData.get("serviceId")) || null,
    price,
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

  // "Pendiente": se lleva el carro y paga despues. Queda por cobrar en el patio.
  if (String(formData.get("paymentMethod")) === "PENDIENTE") {
    if (job.status === "POR_COBRAR") return { error: "Ese lavado ya está pendiente de pago." };
    const r = await dejarPendienteDePago(user.id, washJobId, amount);
    if (r.count === 0) return { error: "Ese lavado ya se cobró o no está listo." };
    await anotarActividad(
      { user, staff },
      { tipo: "cobro", detalle: "Entregó sin cobrar el lavado de " + job.clientName + " (quedó en pendientes)", monto: amount }
    );
    revalidatePath("/panel/patio");
    revalidatePath("/panel/mis-lavados");
    revalidatePath("/panel");
    return { ok: "Quedó en pendientes." };
  }

  const resultado = await cerrarLavado(user.id, washJobId, {
    paymentMethod: readPayment(formData.get("paymentMethod")),
    amount,
    day: todayIn(user.timezone),
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

/**
 * El jefe de patio cierra su turno y se lo entrega al siguiente: queda la foto
 * de lo cobrado, lo que es de los lavadores, el efectivo que deja en mano y
 * los vehiculos que siguen en el patio. Los vehiculos no se tocan: el que
 * llega los sigue viendo en el tablero.
 */
export async function entregarTurnoAction(_prev: PatioState, formData: FormData): Promise<PatioState> {
  const { user, staff } = await requireSession();
  if (!esDePatio(staff.role)) return { error: "Solo el jefe de patio o el dueño entregan el turno." };

  const hoy = todayIn(user.timezone);
  const toRaw = str(formData.get("toStaffId"));
  const siguiente = toRaw
    ? await db.staff.findFirst({
        where: { id: toRaw, userId: user.id, active: true, role: { in: ["SUPERVISOR", "DUENO"] } },
        select: { id: true, name: true },
      })
    : null;
  if (toRaw && !siguiente) return { error: "Esa persona no puede recibir el patio." };
  if (siguiente?.id === staff.id) return { error: "No te puedes entregar el turno a ti mismo." };

  const since = await inicioDelTurno(user.id, hoy, user.timezone);
  const entrega = await entregarTurno(user.id, {
    day: hoy,
    since,
    fromStaffId: staff.id,
    toStaffId: siguiente?.id ?? null,
    cashDelivered: parseMoney(formData.get("cashDelivered"), user.currency),
    notes: str(formData.get("notes"), "", 1000) || null,
  });

  await anotarActividad(
    { user, staff },
    {
      tipo: "caja",
      detalle:
        "Entregó el turno del patio" +
        (siguiente ? " a " + siguiente.name : "") +
        " con " +
        entrega.pendingCount +
        (entrega.pendingCount === 1 ? " vehículo pendiente" : " vehículos pendientes"),
      monto: entrega.totalSales,
    }
  );

  revalidatePath("/panel/patio");
  revalidatePath("/panel/patio/entrega");
  revalidatePath("/panel");
  return { ok: "Turno entregado" + (siguiente ? " a " + siguiente.name : "") + "." };
}

/** El jefe de patio que llega confirma que recibio el patio como se lo dejaron. */
export async function recibirEntregaAction(formData: FormData) {
  const { user, staff } = await requireSession();
  if (!esDePatio(staff.role)) return;

  const id = str(formData.get("id"));
  const r = await recibirEntrega(user.id, id, staff.id);
  if (r.count > 0) {
    await anotarActividad({ user, staff }, { tipo: "caja", detalle: "Recibió el turno del patio" });
  }
  revalidatePath("/panel/patio");
  revalidatePath("/panel/patio/entrega");
}
