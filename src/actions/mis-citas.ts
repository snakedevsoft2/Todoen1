"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { esManicuristaDeMbNails } from "@/lib/mb-nails";
import { armarCobro, armarVenta, leerAdicionales, leerPedidoVenta } from "@/lib/cobro-cita";
import { isValidDay, timeIn, todayIn } from "@/lib/dates";
import { buildSlots, endTimeFor, isWorkDay } from "@/lib/slots";
import { cerosPara, money, parseMoney, pretty12h, shortDay, str, texto } from "@/lib/format";
import { anotarActividad } from "@/lib/actividad";
import { nextReceiptSeq } from "@/lib/receipt-seq";
import { avisarVentaGuardada } from "@/lib/push";
import { anotarCliente } from "@/lib/clientes";

/**
 * Los dos botones de la manicurista de MB Nails en Mis citas (ver
 * lib/mb-nails.ts): Cerrada y Reprogramada. Solo sobre SUS citas: la cita se
 * busca por negocio Y por quien la atiende, nunca solo por el id.
 */

export type CitaState = { error?: string; ok?: string } | undefined;

const PAGOS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];

async function sesionDeManicurista() {
  const sesion = await requireSession({ manicuristaOk: true });
  return esManicuristaDeMbNails(sesion.user, sesion.staff) ? sesion : null;
}

function refrescar() {
  revalidatePath("/panel/mis-citas");
  revalidatePath("/panel/mecato");
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/ventas");
  revalidatePath("/panel");
}

/** Cerrada: la cita queda atendida y se cobra el servicio mas lo adicional. */
export async function cerrarCitaAction(_prev: CitaState, formData: FormData): Promise<CitaState> {
  const sesion = await sesionDeManicurista();
  if (!sesion) return { error: "Esto es solo para las manicuristas." };
  const { user, staff } = sesion;

  const cita = await db.appointment.findFirst({
    where: { id: str(formData.get("id")), userId: user.id, staffId: staff.id },
    include: { sale: { select: { id: true } } },
  });
  if (!cita) return { error: "No encontramos esa cita entre las tuyas." };
  if (cita.sale || cita.status === "ATENDIDO") return { error: "Esa cita ya estaba cerrada." };
  if (cita.status === "CANCELADO") return { error: "Esa cita está cancelada." };

  const adicionales = leerAdicionales(String(formData.get("adicionales") ?? ""));
  if (!adicionales) return { error: "No entendimos lo adicional. Vuelve a agregarlo." };
  const ids = adicionales.flatMap((a) => (a.tipo === "lista" ? [a.serviceId] : []));
  const catalogo = new Map(
    (
      await db.service.findMany({
        where: { userId: user.id, active: true, id: { in: ids } },
        select: { id: true, name: true, price: true },
      })
    ).map((s) => [s.id, { name: s.name, price: s.price }])
  );
  const cobro = armarCobro(cita, adicionales, catalogo, (v) => parseMoney(v, user.currency, cerosPara(user.businessType)));
  if ("error" in cobro) return { error: cobro.error };

  const pago = String(formData.get("paymentMethod") ?? "") as PaymentMethod;
  const paymentMethod = PAGOS.includes(pago) ? pago : "EFECTIVO";

  let ventaId: string;
  try {
    ventaId = await db.$transaction(async (tx) => {
      const venta = await tx.sale.create({
        data: {
          userId: user.id,
          day: cita.day,
          total: cobro.total,
          paymentMethod,
          origin: "TURNO",
          clientName: cita.clientName,
          staffId: staff.id,
          appointmentId: cita.id,
          receiptSeq: await nextReceiptSeq(tx, user.id),
          items: { create: cobro.items.map((i) => ({ userId: user.id, ...i })) },
        },
      });
      await tx.appointment.update({ where: { id: cita.id }, data: { status: "ATENDIDO" } });
      return venta.id;
    });
  } catch (e) {
    // Dos toques seguidos: la venta de la cita es unica, la segunda no entra.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Esa cita ya estaba cerrada." };
    throw e;
  }

  after(() => avisarVentaGuardada(user, { tipo: "venta", id: ventaId }, staff).then(() => undefined));
  const extra = cobro.items.length > 1 ? " (con " + (cobro.items.length - 1) + " adicional" + (cobro.items.length > 2 ? "es" : "") + ")" : "";
  await anotarActividad(
    { user, staff },
    { tipo: "cobro", detalle: "Cerró la cita de " + cita.clientName + ": " + cita.serviceName + extra, monto: cobro.total }
  );
  refrescar();
  return { ok: "Cita cerrada: " + money(cobro.total, user.currency) + "." };
}

/** Reprogramada: la misma cita, otro dia u otra hora, con ella misma. */
export async function reprogramarCitaAction(_prev: CitaState, formData: FormData): Promise<CitaState> {
  const sesion = await sesionDeManicurista();
  if (!sesion) return { error: "Esto es solo para las manicuristas." };
  const { user, staff } = sesion;

  const cita = await db.appointment.findFirst({
    where: { id: str(formData.get("id")), userId: user.id, staffId: staff.id },
    include: { sale: { select: { id: true } }, service: { select: { durationMin: true } } },
  });
  if (!cita) return { error: "No encontramos esa cita entre las tuyas." };
  if (cita.sale || cita.status === "ATENDIDO") return { error: "Esa cita ya está cerrada: no se puede mover." };
  if (cita.status === "CANCELADO") return { error: "Esa cita está cancelada." };

  const day = str(formData.get("day"));
  const startTime = str(formData.get("startTime"));
  const hoy = todayIn(user.timezone);
  if (!isValidDay(day)) return { error: "Escoge el nuevo día." };
  if (day < hoy) return { error: "Ese día ya pasó." };
  if (!buildSlots(user).includes(startTime)) return { error: "Escoge una de las horas de la lista." };
  if (day === hoy && startTime <= timeIn(new Date(), user.timezone)) return { error: "Esa hora de hoy ya pasó." };
  if (!isWorkDay(day, user.workDays)) return { error: "Ese día no se atiende. Escoge otro." };
  if (day === cita.day && startTime === cita.startTime) return { error: "Es la misma fecha y hora que ya tenía." };

  const ocupada = await db.appointment.findFirst({
    where: { userId: user.id, staffId: staff.id, day, startTime, status: { not: "CANCELADO" }, id: { not: cita.id } },
    select: { clientName: true },
  });
  if (ocupada) return { error: "A esa hora ya tienes la cita de " + ocupada.clientName + ". Escoge otra." };

  const antes = shortDay(cita.day) + " " + pretty12h(cita.startTime);
  const nota = "Reprogramada (antes: " + antes + ")";
  try {
    await db.appointment.update({
      where: { id: cita.id },
      data: {
        day,
        startTime,
        endTime: endTimeFor(startTime, cita.service?.durationMin ?? user.slotMinutes),
        // Si no vino y se reprogramo, vuelve a quedar por atender.
        ...(cita.status === "NO_ASISTIO" ? { status: "PENDIENTE" as const } : {}),
        notes: (cita.notes ? cita.notes + " · " : "") + nota,
      },
    });
  } catch (e) {
    // Una cita cancelada sigue ocupando esa hora en la base (es unica por persona y hora).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Esa hora tiene una cita cancelada que la ocupa. Escoge otra o pídele a la dueña que la borre." };
    }
    throw e;
  }

  const ahora = shortDay(day) + " " + pretty12h(startTime);
  await anotarActividad(
    { user, staff },
    { tipo: "turno", detalle: "Reprogramó la cita de " + cita.clientName + " (" + cita.serviceName + ") del " + antes + " al " + ahora }
  );
  refrescar();
  return { ok: "Listo: la cita de " + cita.clientName + " quedó para el " + ahora + "." };
}

/**
 * Mecato: una venta sin cita (bebidas, mecato o lo que sea de la lista), a
 * nombre de la manicurista. Los precios salen del catalogo.
 */
export async function venderMecatoAction(_prev: CitaState, formData: FormData): Promise<CitaState> {
  const sesion = await sesionDeManicurista();
  if (!sesion) return { error: "Esto es solo para las manicuristas." };
  const { user, staff } = sesion;

  const pedido = leerPedidoVenta(String(formData.get("pedido") ?? ""));
  if (!pedido) return { error: "No entendimos lo que escogiste. Vuelve a escogerlo." };
  const catalogo = new Map(
    (
      await db.service.findMany({
        where: { userId: user.id, active: true, id: { in: pedido.map((p) => p.serviceId) } },
        select: { id: true, name: true, price: true },
      })
    ).map((s) => [s.id, { name: s.name, price: s.price }])
  );
  const venta = armarVenta(pedido, catalogo);
  if ("error" in venta) return { error: venta.error };

  const pago = String(formData.get("paymentMethod") ?? "") as PaymentMethod;
  const paymentMethod = PAGOS.includes(pago) ? pago : "EFECTIVO";
  const clientName = texto(formData.get("clientName"), 80) || null;

  const guardada = await db.$transaction(async (tx) =>
    tx.sale.create({
      data: {
        userId: user.id,
        day: todayIn(user.timezone),
        total: venta.total,
        paymentMethod,
        origin: "MANUAL",
        clientName,
        staffId: staff.id,
        receiptSeq: await nextReceiptSeq(tx, user.id),
        items: { create: venta.items.map((i) => ({ userId: user.id, ...i })) },
      },
      select: { id: true },
    })
  );

  after(() => avisarVentaGuardada(user, { tipo: "venta", id: guardada.id }, staff).then(() => undefined));
  await anotarActividad(
    { user, staff },
    {
      tipo: "venta",
      detalle: "Vendió " + venta.items.map((i) => i.qty + "x " + i.name).join(", ") + (clientName ? " a " + clientName : ""),
      monto: venta.total,
    }
  );
  refrescar();
  return { ok: "Venta guardada: " + money(venta.total, user.currency) + "." };
}

/**
 * Agendar: la manicurista separa una cita para ella misma (la clienta llamo o
 * paso por el local). Mismas reglas que la agenda de la dueña: dia que se
 * atiende, una hora de la lista, que no haya pasado y que ella la tenga libre.
 */
export async function agendarCitaAction(_prev: CitaState, formData: FormData): Promise<CitaState> {
  const sesion = await sesionDeManicurista();
  if (!sesion) return { error: "Esto es solo para las manicuristas." };
  const { user, staff } = sesion;

  const clientName = texto(formData.get("clientName"), 80);
  const clientPhone = texto(formData.get("clientPhone"), 40);
  const notes = texto(formData.get("notes"), 300);
  const day = str(formData.get("day"));
  const startTime = str(formData.get("startTime"));
  const hoy = todayIn(user.timezone);

  if (!clientName) return { error: "Escribe el nombre de la clienta." };
  const service = await db.service.findFirst({
    where: { id: str(formData.get("serviceId")), userId: user.id, active: true },
    select: { id: true, name: true, price: true, durationMin: true },
  });
  if (!service) return { error: "Escoge el servicio." };
  if (!isValidDay(day)) return { error: "Escoge el día." };
  if (day < hoy) return { error: "Ese día ya pasó." };
  if (!isWorkDay(day, user.workDays)) return { error: "Ese día no se atiende. Escoge otro." };
  if (!buildSlots(user).includes(startTime)) return { error: "Escoge una de las horas de la lista." };
  if (day === hoy && startTime <= timeIn(new Date(), user.timezone)) return { error: "Esa hora de hoy ya pasó." };

  const ocupada = await db.appointment.findFirst({
    where: { userId: user.id, staffId: staff.id, day, startTime, status: { not: "CANCELADO" } },
    select: { clientName: true },
  });
  if (ocupada) return { error: "A esa hora ya tienes la cita de " + ocupada.clientName + ". Escoge otra." };

  try {
    await db.appointment.create({
      data: {
        userId: user.id,
        serviceId: service.id,
        serviceName: service.name,
        staffId: staff.id,
        staffName: staff.name,
        price: service.price,
        clientName,
        clientPhone: clientPhone || "-",
        day,
        startTime,
        endTime: endTimeFor(startTime, service.durationMin || user.slotMinutes),
        notes: notes || null,
        status: "CONFIRMADO",
      },
    });
  } catch (e) {
    // Una cita cancelada sigue ocupando esa hora en la base (es unica por persona y hora).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Esa hora tiene una cita cancelada que la ocupa. Escoge otra o pídele a la dueña que la borre." };
    }
    throw e;
  }

  await anotarCliente(user.id, { name: clientName, phone: clientPhone || null, source: "turno" });
  const cuando = shortDay(day) + " " + pretty12h(startTime);
  await anotarActividad({ user, staff }, { tipo: "turno", detalle: "Agendó la cita de " + clientName + " (" + service.name + ") el " + cuando });
  refrescar();
  return { ok: "Listo: " + clientName + " quedó agendada el " + cuando + "." };
}
