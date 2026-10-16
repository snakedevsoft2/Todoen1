"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { avisarAPersona, avisarVentaGuardada } from "@/lib/push";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOwner, requireSession } from "@/lib/auth";
import { diaDelTelefono, todayIn } from "@/lib/dates";
import { MAX_DIAS_SIN_CONEXION } from "@/lib/pagos";
import { cerosPara, money, parseMoney, str } from "@/lib/format";
import { anotarActividad } from "@/lib/actividad";
import { esDueno, esSupervisor, puedeHacer } from "@/lib/permisos-empleado";
import {
  asignarLavador,
  cancelarWashJob,
  cerrarLavado,
  crearWashJob,
  dejarPendienteDePago,
  LLAVE_VEHICULO,
  marcarListo,
} from "@/lib/lavadero";
import { avisoDeCercania } from "@/lib/fidelizacion";
import { borrarVehiculo } from "@/lib/borrar-registros";
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

/**
 * El dia en que se hizo, segun el telefono: lo hecho sin senal se sube mas
 * tarde y tiene que caer en la caja del dia en que paso (ver diaDelTelefono).
 */
function diaDe(formData: FormData, timezone: string): string {
  return diaDelTelefono(formData.get("day"), todayIn(timezone), MAX_DIAS_SIN_CONEXION);
}

/**
 * La llave que el telefono le puso al vehiculo, si trae una. "ya": ese
 * vehiculo ya se recibio (la subida se repitio); "ajena": la llave es de otro.
 */
async function llaveDeVehiculo(userId: string, formData: FormData): Promise<{ id: string | null; ya: boolean; ajena: boolean }> {
  const crudo = str(formData.get("washJobId"));
  if (!crudo || !LLAVE_VEHICULO.test(crudo)) return { id: null, ya: false, ajena: false };
  const previo = await db.washJob.findUnique({ where: { id: crudo }, select: { userId: true } });
  return { id: crudo, ya: previo?.userId === userId, ajena: Boolean(previo) && previo?.userId !== userId };
}

/** Dos subidas a la vez del mismo vehiculo: la segunda choca con la llave. */
function esLlaveRepetida(e: unknown): boolean {
  return (e as { code?: string })?.code === "P2002";
}

/** El jefe de patio (o el dueño) recibe un vehiculo que llego al lavadero. */
export async function recibirVehiculoAction(_prev: PatioState, formData: FormData): Promise<PatioState> {
  const { user, staff } = await requireSession();
  if (!esDePatio(staff.role)) return { error: "No tienes permiso para recibir vehículos." };

  const llave = await llaveDeVehiculo(user.id, formData);
  if (llave.ajena) return { error: "Ese vehículo no se puede recibir." };
  if (llave.ya) return { ok: "Vehículo recibido." };

  const clientName = str(formData.get("clientName"));
  const clientPhone = str(formData.get("clientPhone"), "-");
  if (!clientName) return { error: "Escribe el nombre del cliente." };
  if (clientPhone === "-") return { error: "Escribe el celular del cliente." };

  // Vacio: se usa el precio del catalogo. Con algo escrito, ese manda (se
  // vendio mas barato o mas caro que de costumbre).
  const priceRaw = str(formData.get("price"));
  // parseMoney y no parseIntSafe: "18.000" con punto se guardaba como 18.
  const price = priceRaw ? parseMoney(priceRaw, user.currency, cerosPara(user.businessType)) : null;

  let job: Awaited<ReturnType<typeof crearWashJob>>;
  try {
    job = await crearWashJob(user.id, diaDe(formData, user.timezone), {
      id: llave.id,
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
  } catch (e) {
    if (llave.id && esLlaveRepetida(e)) return { ok: "Vehículo recibido." };
    throw e;
  }

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

  const asignado = await asignarLavador(user.id, washJobId, lavador.id);
  // Al lavador le llega al celular el carro que le toca.
  if (asignado) {
    const carro =
      [asignado.vehiclePlate, asignado.vehicleType, asignado.vehicleColor].filter(Boolean).join(" · ") ||
      asignado.clientName;
    after(() =>
      avisarAPersona(user.id, lavador.id, {
        title: "Te asignaron un carro",
        body: carro + " · " + asignado.serviceName,
        url: "/panel/mis-lavados",
        tag: "asignado-" + asignado.id,
      }).then(() => undefined)
    );
  }
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

  const amountRaw = str(formData.get("amount"));
  const amount = amountRaw ? parseMoney(amountRaw, user.currency, cerosPara(user.businessType)) : job.price;

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
    day: diaDe(formData, user.timezone),
  });
  if (!resultado) return { error: "Ese lavado ya se cobró o no está listo para cobrarse." };
  after(() => avisarVentaGuardada(user, { tipo: "venta", id: resultado.saleId }, staff).then(() => undefined));

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

/**
 * Borra un vehiculo, en cualquier estado: del tablero (se equivocaron al
 * recibirlo) o del historial, ya cobrado. Si ya se cobro, su venta se borra
 * con el (ver lib/borrar-registros.ts). Solo el dueño, y queda en la auditoria.
 */
export async function deleteWashJobAction(formData: FormData) {
  const { user, staff } = await requireSession();
  if (!puedeHacer(staff.role, "deleteWashJobAction")) return;

  const borrado = await borrarVehiculo(user.id, str(formData.get("id")));
  if (!borrado) return;

  await anotarActividad(
    { user, staff },
    {
      tipo: "borrado",
      detalle:
        "Borró el vehículo de " +
        borrado.clientName +
        (borrado.vehiclePlate ? " (" + borrado.vehiclePlate + ")" : "") +
        (borrado.ventaTotal !== null ? " y su venta de " + money(borrado.ventaTotal, user.currency) : " del patio"),
      monto: borrado.ventaTotal ?? undefined,
    }
  );
  revalidatePath("/panel/patio");
  revalidatePath("/panel/patio/historial");
  revalidatePath("/panel/mis-lavados");
  if (borrado.ventaTotal !== null) {
    revalidatePath("/panel/ventas");
    revalidatePath("/panel/caja");
    revalidatePath("/panel");
  }
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

  const llave = await llaveDeVehiculo(user.id, formData);
  if (llave.ya || llave.ajena) return;

  await crearWashJob(user.id, diaDe(formData, user.timezone), {
    id: llave.id,
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

/**
 * Corrige los datos del vehiculo: cliente, placa, tipo, color, servicio. El
 * jefe de patio, antes de cobrarlo; el dueño, tambien despues.
 *
 * El servicio solo cambia mientras no se haya cobrado: la venta ya dice que
 * se cobro. Y el precio solo cambia si cambia el servicio (el que se escribio
 * a mano no se pisa con el del catalogo); para cambiarlo esta
 * cambiarPrecioLavadoAction, que corrige tambien la venta.
 */
export async function updateWashJobAction(formData: FormData) {
  const { user, staff } = await requireSession();
  if (!puedeHacer(staff.role, "updateWashJobAction")) return;

  const id = str(formData.get("id"));
  const job = await db.washJob.findFirst({ where: { id, userId: user.id }, include: { sale: { select: { id: true } } } });
  if (!job) return;
  if (job.status === "ENTREGADO" && !esDueno(staff.role)) return;

  const serviceId = str(formData.get("serviceId"));
  const service =
    serviceId && serviceId !== job.serviceId && !job.sale
      ? await db.service.findFirst({ where: { id: serviceId, userId: user.id } })
      : null;
  const clientName = str(formData.get("clientName"), job.clientName);

  await db.$transaction(async (tx) => {
    await tx.washJob.update({
      where: { id: job.id },
      data: {
        clientName,
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
    // El recibo y la lista de Ventas dicen el cliente de la venta.
    if (job.sale && clientName !== job.clientName) {
      await tx.sale.update({ where: { id: job.sale.id }, data: { clientName } });
    }
  });

  await anotarActividad(
    { user, staff },
    { tipo: "cambio", detalle: "Cambió los datos del vehículo de " + job.clientName }
  );
  revalidatePath("/panel/patio");
  revalidatePath("/panel/patio/historial");
  if (job.sale) revalidatePath("/panel/ventas");
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

/**
 * Corrige el precio de un lavado (por ejemplo, uno que quedo en $18
 * porque escribieron "18.000" y se leyo mal).
 *
 * Si el lavado ya se cobro, su venta cambia con el: sin eso la caja y el
 * reporte seguirian diciendo el precio viejo. Una venta con factura
 * autorizada no se toca, igual que al editarla desde Ventas.
 */
export async function cambiarPrecioLavadoAction(formData: FormData) {
  // El dueño y el jefe de patio; el cambio queda en Empleados > Auditoria.
  const { user, staff } = await requireSession();
  if (!puedeHacer(staff.role, "cambiarPrecioLavadoAction")) return;

  const id = str(formData.get("washJobId"));
  const price = parseMoney(formData.get("price"), user.currency, cerosPara(user.businessType));
  if (price <= 0) return;

  const job = await db.washJob.findFirst({
    where: { id, userId: user.id },
    include: { sale: { include: { items: true, electronicInvoice: { select: { status: true } } } } },
  });
  if (!job) return;

  const factura = job.sale?.electronicInvoice?.status;
  if (factura === "AUTORIZADA" || factura === "ENVIANDO") return;

  // La linea del lavado es la que creo el cobro: la del servicio, o la primera.
  const linea = job.sale ? (job.sale.items.find((i) => i.name === job.serviceName) ?? job.sale.items[0]) : undefined;
  // Lo que vale hoy es lo cobrado, si ya se cobro: el lavado podia decir
  // $25.000 y la venta $30 (se escribio "30" al cobrar).
  const anterior = job.sale ? job.sale.total : job.price;
  if (anterior === price && job.price === price) return;

  await db.$transaction(async (tx) => {
    await tx.washJob.update({ where: { id: job.id }, data: { price } });
    if (!job.sale || !linea) return;
    await tx.saleItem.update({ where: { id: linea.id }, data: { unitPrice: price } });
    await tx.sale.update({
      where: { id: job.sale.id },
      data: { total: { increment: (price - linea.unitPrice) * linea.qty } },
    });
  });

  await anotarActividad(
    { user, staff },
    {
      tipo: "cambio",
      detalle:
        "Cambió el precio del lavado de " +
        job.clientName +
        (job.vehiclePlate ? " (" + job.vehiclePlate + ")" : "") +
        " de " +
        money(anterior, user.currency) +
        " a " +
        money(price, user.currency),
      monto: price,
    }
  );
  revalidatePath("/panel/patio/lavador/" + (job.assignedStaffId ?? ""));
  revalidatePath("/panel/patio");
  revalidatePath("/panel/ventas");
  revalidatePath("/panel/caja");
  revalidatePath("/panel");
}

/**
 * Borra una entrega de turno (el reporte que deja el jefe de patio al irse).
 * Solo el dueño. Las ventas, los gastos y los vehiculos no se tocan: la
 * entrega es una foto de ese momento.
 */
export async function borrarEntregaAction(formData: FormData) {
  const { user, staff } = await requireOwner();
  const id = str(formData.get("id"));
  const entrega = await db.patioHandover.findFirst({
    where: { id, userId: user.id },
    select: { day: true, totalSales: true, fromStaff: { select: { name: true } } },
  });
  if (!entrega) return;

  await db.patioHandover.delete({ where: { id } });
  await anotarActividad(
    { user, staff },
    {
      tipo: "borrado",
      detalle: "Borró la entrega de turno del " + entrega.day + (entrega.fromStaff ? " de " + entrega.fromStaff.name : ""),
      monto: entrega.totalSales,
    }
  );
  revalidatePath("/panel/patio");
  revalidatePath("/panel/patio/entrega");
}
