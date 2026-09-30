import { headers } from "next/headers";
import type { ParkingTicket, PaymentMethod, Prisma } from "@prisma/client";
import { db } from "./db";
import { qrModulos } from "./qr";
import type { TicketData } from "./ticket-parqueadero";
import { inicioDelDiaEn } from "./dates";
import { nextReceiptSeq } from "./receipt-seq";
import { cobroDe, duracionTexto, minutosEntre, normalizarPlaca, type Tarifa } from "./parqueadero-tarifa";

/**
 * El parqueadero: un vehiculo entra con su placa, se le entrega un ticket con
 * QR y, al salir, se cobra por el tiempo que estuvo adentro.
 *
 * Vive aparte de actions/parqueadero.ts por lo mismo que lib/lavadero.ts: la
 * logica no depende de que la llamada venga de un formulario, y las pruebas la
 * usan directo.
 *
 * Todo filtra por userId: el ticket de un parqueadero nunca se alcanza desde
 * otro, aunque alguien adivine el id.
 */

/** Las tarifas con que arranca un parqueadero nuevo. Las cambia en Tarifas. */
export const TARIFAS_DE_EJEMPLO: (Tarifa & { name: string })[] = [
  { name: "Moto", pricePerHour: 1500, fractionMinutes: 60, graceMinutes: 0, pricePerDay: 10000 },
  { name: "Carro", pricePerHour: 3000, fractionMinutes: 60, graceMinutes: 0, pricePerDay: 20000 },
];

/**
 * Si el negocio nunca ha tenido tarifas, le deja las de ejemplo.
 *
 * Se llama al abrir el parqueadero y no al registrarse para que tambien le
 * sirva a quien cambia de tipo de negocio. Cuenta las apagadas tambien: quien
 * las apago todas lo hizo a proposito.
 */
export async function asegurarTarifas(userId: string): Promise<void> {
  const hay = await db.parkingRate.count({ where: { userId } });
  if (hay > 0) return;
  await db.parkingRate.createMany({
    data: TARIFAS_DE_EJEMPLO.map((t, i) => ({ userId, ...t, sortOrder: i })),
  });
}

export function tarifasActivas(userId: string) {
  return db.parkingRate.findMany({
    where: { userId, active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** La tarifa que quedo copiada en el ticket al entrar. */
export function tarifaDelTicket(t: Pick<ParkingTicket, "pricePerHour" | "fractionMinutes" | "graceMinutes" | "pricePerDay">): Tarifa {
  return {
    pricePerHour: t.pricePerHour,
    fractionMinutes: t.fractionMinutes,
    graceMinutes: t.graceMinutes,
    pricePerDay: t.pricePerDay,
  };
}

/** Lo que va debiendo un vehiculo que sigue adentro, a esta hora. */
export function cobroAhora(t: Pick<ParkingTicket, "enteredAt" | "pricePerHour" | "fractionMinutes" | "graceMinutes" | "pricePerDay">, ahora = new Date()): number {
  return cobroDe(tarifaDelTicket(t), minutosEntre(t.enteredAt, ahora));
}

export type DatosIngreso = {
  plate: string;
  rateId: string;
  phone?: string | null;
  email?: string | null;
  spot?: string | null;
  receivedById?: string | null;
};

export type ResultadoIngreso = { ok: true; ticket: ParkingTicket } | { ok: false; error: string };

/**
 * Ingresa un vehiculo. La placa es lo unico obligatorio (ademas del tipo, que
 * dice la tarifa); telefono, correo y puesto son opcionales.
 */
export async function ingresarVehiculo(userId: string, day: string, datos: DatosIngreso): Promise<ResultadoIngreso> {
  const plate = normalizarPlaca(datos.plate);
  if (plate.length < 3) return { ok: false, error: "Escribe la placa del vehículo." };

  const rate = await db.parkingRate.findFirst({ where: { id: datos.rateId, userId, active: true } });
  if (!rate) return { ok: false, error: "Elige el tipo de vehículo." };

  // La misma placa no puede estar dos veces adentro: casi siempre es que le
  // dieron dos veces al boton, o que la salida anterior no se registro.
  const adentro = await db.parkingTicket.findFirst({
    where: { userId, plate, status: "DENTRO" },
    select: { seq: true },
  });
  if (adentro) {
    return { ok: false, error: "La placa " + plate + " ya está adentro (ticket " + String(adentro.seq).padStart(4, "0") + ")." };
  }

  const ticket = await db.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: userId },
      data: { nextTicketSeq: { increment: 1 } },
      select: { nextTicketSeq: true },
    });
    return tx.parkingTicket.create({
      data: {
        userId,
        day,
        seq: u.nextTicketSeq - 1,
        plate,
        phone: datos.phone?.trim().slice(0, 40) || null,
        email: datos.email?.trim().toLowerCase().slice(0, 120) || null,
        spot: datos.spot?.trim().slice(0, 60) || null,
        rateId: rate.id,
        vehicleType: rate.name,
        pricePerHour: rate.pricePerHour,
        fractionMinutes: rate.fractionMinutes,
        graceMinutes: rate.graceMinutes,
        pricePerDay: rate.pricePerDay,
        receivedById: datos.receivedById ?? null,
      },
    });
  });

  return { ok: true, ticket };
}

export type Salida = {
  /** "PENDIENTE": sale sin pagar y queda debiendo. */
  paymentMethod: PaymentMethod | "PENDIENTE";
  /** Si viene, manda sobre la cuenta de la tarifa (un descuento del dueño). */
  amount?: number | null;
  /** Hoy en la zona del negocio: el dia en que entra la plata. */
  day: string;
  staffId?: string | null;
  ahora?: Date;
};

export type ResultadoSalida =
  | { ok: true; amount: number; saleId: string | null; pendiente: boolean }
  | { ok: false; error: string };

/**
 * Registra la salida de un vehiculo, o cobra al que ya habia salido debiendo.
 *
 * Al pagar se crea la venta (origen PARQUEADERO) y con eso cae sola en
 * Ventas, en la caja del dia y en los reportes. Si sale sin pagar, la cuenta
 * se congela en lo que iba y queda en Pendientes por pagar; la venta se crea
 * el dia en que pague.
 *
 * El cambio de estado se hace con una condicion sobre el estado anterior
 * dentro de la transaccion: si dos personas le dan a cobrar al mismo tiempo,
 * solo una crea la venta.
 */
export async function registrarSalida(userId: string, ticketId: string, salida: Salida): Promise<ResultadoSalida> {
  const ticket = await db.parkingTicket.findFirst({ where: { id: ticketId, userId } });
  if (!ticket) return { ok: false, error: "No encontramos ese ticket." };
  if (ticket.status !== "DENTRO" && ticket.status !== "POR_COBRAR") {
    return { ok: false, error: ticket.status === "PAGADO" ? "Ese ticket ya se pagó." : "Ese ticket está anulado." };
  }

  const ahora = salida.ahora ?? new Date();
  const exitedAt = ticket.exitedAt ?? ahora;
  const calculado = ticket.status === "POR_COBRAR" ? (ticket.amount ?? 0) : cobroAhora(ticket, exitedAt);
  const amount = salida.amount != null && salida.amount >= 0 ? salida.amount : calculado;

  if (salida.paymentMethod === "PENDIENTE") {
    if (ticket.status === "POR_COBRAR") return { ok: false, error: "Ese ticket ya está pendiente de pago." };
    const r = await db.parkingTicket.updateMany({
      where: { id: ticket.id, userId, status: "DENTRO" },
      data: { status: "POR_COBRAR", exitedAt, amount, closedById: salida.staffId ?? null },
    });
    if (r.count === 0) return { ok: false, error: "Ese vehículo ya salió." };
    return { ok: true, amount, saleId: null, pendiente: true };
  }

  const paymentMethod = salida.paymentMethod;
  const minutos = minutosEntre(ticket.enteredAt, exitedAt);

  try {
    const saleId = await db.$transaction(async (tx) => {
      const r = await tx.parkingTicket.updateMany({
        where: { id: ticket.id, userId, status: { in: ["DENTRO", "POR_COBRAR"] } },
        data: { status: "PAGADO", exitedAt, amount, closedById: salida.staffId ?? ticket.closedById ?? null },
      });
      if (r.count === 0) throw new YaCobrado();

      const sale = await tx.sale.create({
        data: {
          userId,
          day: salida.day,
          total: amount,
          paymentMethod,
          origin: "PARQUEADERO",
          clientName: ticket.plate,
          staffId: salida.staffId ?? null,
          parkingTicketId: ticket.id,
          receiptSeq: await nextReceiptSeq(tx, userId),
          notes: "Ticket " + String(ticket.seq).padStart(4, "0"),
          items: {
            create: [
              {
                userId,
                name: "Parqueadero " + ticket.vehicleType.toLowerCase() + " " + ticket.plate + " · " + duracionTexto(minutos),
                unitPrice: amount,
                qty: 1,
              },
            ],
          },
        },
        select: { id: true },
      });
      return sale.id;
    });
    return { ok: true, amount, saleId, pendiente: false };
  } catch (e) {
    if (e instanceof YaCobrado) return { ok: false, error: "Ese ticket ya se cobró." };
    throw e;
  }
}

class YaCobrado extends Error {}

/** Anula un ticket (se ingreso por error). El que ya se pago no se anula: se borra la venta. */
export async function anularTicket(userId: string, ticketId: string): Promise<boolean> {
  const r = await db.parkingTicket.updateMany({
    where: { id: ticketId, userId, status: { in: ["DENTRO", "POR_COBRAR"] } },
    data: { status: "ANULADO" },
  });
  return r.count > 0;
}

export type ResumenParqueadero = {
  /** Vehiculos adentro ahora mismo (de hoy o de dias anteriores). */
  adentro: number;
  /** Lo que van debiendo los de adentro si salieran ya. */
  adentroValor: number;
  /** Los que entraron hoy (sin los anulados). */
  entraronHoy: number;
  /** Los que salieron hoy, pagando o debiendo. */
  salieronHoy: number;
  /** Salieron sin pagar (de cualquier dia). */
  porCobrar: number;
  porCobrarValor: number;
  /** La plata que entro hoy por el parqueadero. */
  recaudadoHoy: number;
  pagosHoy: number;
};

export async function resumenParqueadero(
  userId: string,
  day: string,
  timezone: string,
  ahora = new Date()
): Promise<ResumenParqueadero> {
  const desde = inicioDelDiaEn(day, timezone);
  const [adentro, entraronHoy, salieronHoy, porCobrar, ventas] = await Promise.all([
    db.parkingTicket.findMany({
      where: { userId, status: "DENTRO" },
      select: { enteredAt: true, pricePerHour: true, fractionMinutes: true, graceMinutes: true, pricePerDay: true },
    }),
    db.parkingTicket.count({ where: { userId, day, status: { not: "ANULADO" } } }),
    db.parkingTicket.count({
      where: { userId, status: { in: ["PAGADO", "POR_COBRAR"] }, exitedAt: { gte: desde } },
    }),
    db.parkingTicket.aggregate({
      where: { userId, status: "POR_COBRAR" },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    db.sale.aggregate({
      where: { userId, day, origin: "PARQUEADERO" },
      _count: { _all: true },
      _sum: { total: true },
    }),
  ]);

  return {
    adentro: adentro.length,
    adentroValor: adentro.reduce((s, t) => s + cobroAhora(t, ahora), 0),
    entraronHoy,
    salieronHoy,
    porCobrar: porCobrar._count._all,
    porCobrarValor: porCobrar._sum.amount ?? 0,
    recaudadoHoy: ventas._sum.total ?? 0,
    pagosHoy: ventas._count._all,
  };
}

/** Los datos de una tarifa escritos en el formulario, ya validados. */
export type DatosTarifa = Tarifa & { name: string };

export function validarTarifa(d: DatosTarifa): string | null {
  if (!d.name.trim()) return "Escribe el tipo de vehículo (moto, carro...).";
  if (d.pricePerHour <= 0 && d.pricePerDay <= 0) return "Ponle precio por hora, por día o los dos.";
  if (d.graceMinutes < 0 || d.graceMinutes > 240) return "Los minutos gratis van de 0 a 240.";
  if (d.pricePerHour > 0 && d.pricePerDay > 0 && d.pricePerDay < d.pricePerHour) {
    return "El precio del día no puede ser menor que el de una hora.";
  }
  return null;
}

export type TicketConNegocio = Prisma.ParkingTicketGetPayload<{
  include: { user: { select: { businessName: true; address: true; phone: true; whatsappNumber: true; currency: true; timezone: true; slug: true; updatedAt: true } } };
}>;

/** Lo que abre el QR del ticket. Publico: se busca por el token, que no se puede adivinar. */
export function ticketPorToken(token: string): Promise<TicketConNegocio | null> {
  return db.parkingTicket.findUnique({
    where: { qrToken: token },
    include: {
      user: {
        select: {
          businessName: true,
          address: true,
          phone: true,
          whatsappNumber: true,
          currency: true,
          timezone: true,
          slug: true,
          updatedAt: true,
        },
      },
    },
  });
}

/**
 * La direccion desde donde se esta usando la aplicacion, para armar el enlace
 * del QR. Se toma de la peticion y no de una variable fija: asi el QR apunta
 * al mismo dominio en el que el parqueadero abrio la aplicacion.
 */
export async function origenDeLaPeticion(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return proto.split(",")[0].trim() + "://" + host.split(",")[0].trim();
}

export function rutaPublicaDelTicket(qrToken: string): string {
  return "/ticket/" + qrToken;
}

/** Todo lo que el navegador necesita para imprimir o mandar el ticket. */
export function datosDelTicket(
  ticket: ParkingTicket,
  negocio: { businessName: string; address: string | null; phone: string | null; currency: string; timezone: string },
  origen: string,
  logoUrl: string | null
): TicketData {
  const url = origen + rutaPublicaDelTicket(ticket.qrToken);
  const salio = (ticket.status === "PAGADO" || ticket.status === "POR_COBRAR") && ticket.exitedAt;
  return {
    businessName: negocio.businessName,
    address: negocio.address,
    phone: negocio.phone,
    logoUrl,
    seq: ticket.seq,
    plate: ticket.plate,
    vehicleType: ticket.vehicleType,
    spot: ticket.spot,
    enteredAt: ticket.enteredAt.toISOString(),
    timezone: negocio.timezone,
    currency: negocio.currency,
    tarifa: tarifaDelTicket(ticket),
    url,
    qrModulos: qrModulos(url),
    salida: salio
      ? {
          exitedAt: ticket.exitedAt!.toISOString(),
          minutos: minutosEntre(ticket.enteredAt, ticket.exitedAt!),
          amount: ticket.amount ?? 0,
          pendiente: ticket.status === "POR_COBRAR",
        }
      : null,
  };
}
