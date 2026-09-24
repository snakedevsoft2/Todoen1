import type { PaymentMethod } from "@prisma/client";
import { db } from "./db";
import { anotarCliente } from "./clientes";
import { registrarSello, type ResultadoSello } from "./fidelizacion";

/**
 * El patio del lavadero: un vehiculo llega, se anota el cliente, se asigna a
 * un lavador y al final se cobra.
 *
 * No reutiliza Appointment (turno reservado, unico por dia+hora+barbero): esto
 * es una cola de llegada libre con estados propios (en cola, lavando, listo,
 * entregado), no un horario. Ver WashJob en el schema.
 *
 * Vive aparte de actions/lavadero.ts para que la logica de negocio no dependa
 * de que la llamada venga de un formulario: los mismos pasos sirven si algun
 * dia entra una reserva publica o un lote desde otra pantalla.
 */

export type DatosVehiculo = {
  clientName: string;
  clientPhone: string;
  vehiclePlate: string | null;
  vehicleType: string | null;
  vehicleColor: string | null;
  serviceId: string | null;
  notes: string | null;
  receivedById: string;
  appointmentId?: string | null;
};

export async function crearWashJob(userId: string, day: string, datos: DatosVehiculo) {
  const service = datos.serviceId
    ? await db.service.findFirst({ where: { id: datos.serviceId, userId } })
    : null;

  const customerId = await anotarCliente(userId, {
    name: datos.clientName,
    phone: datos.clientPhone || null,
    source: "lavado",
  });

  return db.washJob.create({
    data: {
      userId,
      day,
      clientName: datos.clientName,
      clientPhone: datos.clientPhone,
      customerId,
      vehiclePlate: datos.vehiclePlate || null,
      vehicleType: datos.vehicleType || null,
      vehicleColor: datos.vehicleColor || null,
      serviceId: service?.id ?? null,
      serviceName: service?.name ?? "Lavado",
      price: service?.price ?? 0,
      receivedById: datos.receivedById,
      appointmentId: datos.appointmentId ?? null,
    },
  });
}

/** El jefe de patio le pone lavador: eso ya arranca el lavado. */
export async function asignarLavador(userId: string, washJobId: string, staffId: string) {
  const job = await db.washJob.findFirst({
    where: { id: washJobId, userId, status: { in: ["EN_COLA", "LAVANDO"] } },
  });
  if (!job) return null;
  return db.washJob.update({
    where: { id: job.id },
    data: { assignedStaffId: staffId, status: "LAVANDO", startedAt: job.startedAt ?? new Date() },
  });
}

export async function marcarListo(userId: string, washJobId: string) {
  const job = await db.washJob.findFirst({ where: { id: washJobId, userId, status: "LAVANDO" } });
  if (!job) return null;
  return db.washJob.update({ where: { id: job.id }, data: { status: "LISTO", readyAt: new Date() } });
}

export async function cancelarWashJob(userId: string, washJobId: string) {
  return db.washJob.updateMany({
    where: { id: washJobId, userId, status: { notIn: ["ENTREGADO", "CANCELADO"] } },
    data: { status: "CANCELADO" },
  });
}

export type CierreLavado = { paymentMethod: PaymentMethod; amount: number };

/** Cobra el lavado: crea la Sale, entrega el vehiculo y deja el sello de fidelizacion. */
export async function cerrarLavado(
  userId: string,
  washJobId: string,
  cierre: CierreLavado
): Promise<{ saleId: string; sello: ResultadoSello | null } | null> {
  const job = await db.washJob.findFirst({
    where: { id: washJobId, userId, status: { in: ["LAVANDO", "LISTO"] } },
    include: { sale: true },
  });
  if (!job || job.sale) return null;

  const goal = (await db.user.findUnique({ where: { id: userId }, select: { loyaltyGoal: true } }))?.loyaltyGoal ?? 10;

  return db.$transaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        userId,
        day: job.day,
        total: cierre.amount,
        paymentMethod: cierre.paymentMethod,
        origin: "LAVADO",
        clientName: job.clientName,
        staffId: job.assignedStaffId,
        washJobId: job.id,
        items: {
          create: [
            {
              userId,
              serviceId: job.serviceId,
              name: job.serviceName,
              unitPrice: cierre.amount,
              qty: 1,
            },
          ],
        },
      },
    });

    await tx.washJob.update({
      where: { id: job.id },
      data: { status: "ENTREGADO", deliveredAt: new Date() },
    });

    const sello = await registrarSello(tx, {
      userId,
      customerId: job.customerId,
      saleId: sale.id,
      goal,
    });

    return { saleId: sale.id, sello };
  });
}
