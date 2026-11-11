"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { avisarVentaGuardada } from "@/lib/push";
import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { anotarCliente } from "@/lib/clientes";
import { requireOwner, requireSession } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { cerosPara, money, parseIntSafe, parseMoney, str, texto } from "@/lib/format";
import { saldo } from "@/lib/debts";
import {
  esFrecuencia,
  planDeCuotas,
  totalConInteres,
  type Frecuencia,
} from "@/lib/prestamos";
import { anotarActividad } from "@/lib/actividad";
import { SOLO_DUENO, esDueno } from "@/lib/permisos-empleado";
import { formatReceiptSeq, nextReceiptSeq } from "@/lib/receipt-seq";
import { itemsParaAgregar, resumenDeItems, type ItemPedido } from "@/lib/items-agregados";
import { esEmInversiones, opcionesPlanDe } from "@/lib/em-inversiones";

export type DebtState =
  | {
      error?: string;
      ok?: string;
      /** Para poder sacar la constancia del préstamo justo al anotarlo. */
      recibo?: {
        debtId: string;
        clientName: string;
        clientPhone: string | null;
        concept: string;
        amount: number;
        day: string;
        receiptSeq: number | null;
      };
      /** Al renovar: el prestamo nuevo, para ir a verlo. */
      nuevaId?: string;
    }
  | undefined;

const VALID_PAYMENTS: PaymentMethod[] = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"];

function readPayment(value: FormDataEntryValue | null): PaymentMethod {
  const v = String(value ?? "EFECTIVO") as PaymentMethod;
  return VALID_PAYMENTS.includes(v) ? v : "EFECTIVO";
}

function refresh(id?: string) {
  revalidatePath("/panel/cartera");
  if (id) revalidatePath("/panel/cartera/" + id);
  // Las deudas que se dejan desde Ventas (el "Pendiente" del lavadero) salen ahi.
  revalidatePath("/panel/ventas");
  revalidatePath("/panel");
}

/** Anota que alguien quedo debiendo. */
export async function createDebtAction(
  _prev: DebtState,
  formData: FormData
): Promise<DebtState> {
  const { user, staff } = await requireSession();

  const clientName = str(formData.get("clientName"));
  if (!clientName) return { error: "Escribe quien debe." };

  const concept = str(formData.get("concept"));
  if (!concept) return { error: "Escribe por que debe." };

  /**
   * Un prestamo por cuotas o un fiado suelto.
   *
   * El fiado de una tienda solo tiene un monto. El prestamo tiene capital,
   * interes y cuotas, y de ahi sale el total: no se escribe a mano, para que
   * nunca pueda quedar un total que no cuadre con lo que se presto.
   */
  const esPrestamo = str(formData.get("modo")) === "prestamo";
  const clientPhone = str(formData.get("clientPhone")) || null;
  if (esPrestamo && !clientPhone) return { error: "Escribe el celular de quien recibe el préstamo." };

  let amount = 0;
  let principal: number | null = null;
  let interestPct: number | null = null;
  let installments: number | null = null;
  let frequency: Frecuencia | null = null;

  if (esPrestamo) {
    principal = parseMoney(formData.get("principal"), user.currency);
    if (principal <= 0) return { error: "Escribe cuanto le prestaste." };

    interestPct = Math.max(0, parseIntSafe(formData.get("interestPct"), 0));
    if (interestPct > 500) return { error: "Ese interes no parece real. Revisalo." };

    installments = parseIntSafe(formData.get("installments"), 0);
    if (installments <= 0) return { error: "Escribe en cuantas cuotas te va a pagar." };
    if (installments > 500) return { error: "Son demasiadas cuotas. Maximo 500." };

    const f = str(formData.get("frequency"));
    if (!esFrecuencia(f)) return { error: "Elige cada cuanto te paga." };
    frequency = f;

    amount = totalConInteres(principal, interestPct);
  } else {
    amount = parseMoney(formData.get("amount"), user.currency);
    if (amount <= 0) return { error: "El valor debe ser mayor a cero." };
  }

  const dayInput = str(formData.get("day"));
  const dueInput = str(formData.get("dueDay"));
  const day = isValidDay(dayInput) ? dayInput : todayIn(user.timezone);

  if (dueInput && !isValidDay(dueInput)) return { error: "La fecha de vencimiento no es valida." };
  if (dueInput && dueInput < day) {
    return { error: "El vencimiento no puede ser antes de la fecha de la deuda." };
  }

  // En un prestamo el vencimiento es el dia de la ultima cuota: no hay que
  // pedirlo, sale del plan. Asi la lista de vencidas sigue funcionando igual.
  let dueDay = dueInput || null;
  if (esPrestamo && frequency && installments) {
    const plan = planDeCuotas({
      total: amount,
      cuotas: installments,
      frecuencia: frequency,
      desde: day,
      ...opcionesPlanDe(user),
    });
    dueDay = plan[plan.length - 1]?.day ?? dueDay;
  }

  const nueva = await db.$transaction(async (tx) => {
    const receiptSeq = await nextReceiptSeq(tx, user.id);
    return tx.debt.create({
      data: {
        userId: user.id,
        // Con quien queda: si el negocio tiene empleados con cuenta separada,
        // cada uno ve solo lo suyo (ver lib/permisos-empleado.ts).
        staffId: staff.id,
        clientName,
        clientPhone,
        clientAddress: str(formData.get("clientAddress")) || null,
        concept,
        amount,
        day,
        dueDay,
        notes: texto(formData.get("notes")) || null,
        // Si la venta ya se registro, cobrar no vuelve a sumar a la caja.
        alreadyInvoiced: formData.get("alreadyInvoiced") === "on",
        principal,
        interestPct,
        installments,
        frequency,
        // El fiador: quien responde si el deudor no paga.
        guarantorName: str(formData.get("guarantorName")) || null,
        guarantorId: str(formData.get("guarantorId")) || null,
        guarantorPhone: str(formData.get("guarantorPhone")) || null,
        guarantorAddress: str(formData.get("guarantorAddress")) || null,
        // Otras personas a quien marcar si no contesta.
        reference1Name: str(formData.get("reference1Name")) || null,
        reference1Phone: str(formData.get("reference1Phone")) || null,
        reference2Name: str(formData.get("reference2Name")) || null,
        reference2Phone: str(formData.get("reference2Phone")) || null,
        receiptSeq,
      },
    });
  });
  await anotarActividad(
    { user, staff },
    { tipo: "deuda", detalle: (esPrestamo ? "Anotó un préstamo a " : "Anotó una deuda de ") + clientName + ": " + concept, monto: amount }
  );

  await anotarCliente(user.id, {
    name: clientName,
    phone: clientPhone,
    source: "cartera",
  });

  refresh();
  return {
    ok: esPrestamo ? "Prestamo anotado." : "Deuda anotada.",
    recibo: esPrestamo
      ? { debtId: nueva.id, clientName, clientPhone, concept, amount, day, receiptSeq: nueva.receiptSeq }
      : undefined,
  };
}

/**
 * Registra un abono.
 *
 * Cuando la deuda no estaba facturada, el abono si es venta del dia: la plata
 * entra hoy a la caja y por eso creamos la venta. Si ya estaba facturada, solo
 * se descuenta del saldo, porque esa plata ya se conto cuando se hizo la venta.
 * Las dos cosas van en una sola transaccion.
 */
export async function addPaymentAction(
  _prev: DebtState,
  formData: FormData
): Promise<DebtState> {
  const { user, staff: me } = await requireSession();
  const debtId = str(formData.get("debtId"));

  const debt = await db.debt.findFirst({
    where: { id: debtId, userId: user.id },
    include: { payments: { select: { amount: true } } },
  });
  if (!debt) return { error: "No encontramos esa deuda." };
  if (debt.status === "ANULADA") return { error: "Esa deuda esta anulada." };

  const pendiente = saldo(debt);
  if (pendiente === 0) return { error: "Esa deuda ya esta pagada." };

  const amount = parseMoney(formData.get("amount"), user.currency);
  if (amount <= 0) return { error: "El abono debe ser mayor a cero." };
  if (amount > pendiente) {
    return { error: "El abono es mayor que lo que falta. Faltan " + pendiente + "." };
  }

  const dayInput = str(formData.get("day"));
  const day = isValidDay(dayInput) ? dayInput : todayIn(user.timezone);
  const method = readPayment(formData.get("method"));
  const notes = texto(formData.get("notes")) || null;

  const ventaAbono = await db.$transaction(async (tx) => {
    let saleId: string | null = null;

    if (!debt.alreadyInvoiced) {
      const sale = await tx.sale.create({
        data: {
          userId: user.id,
          day,
          total: amount,
          staffId: me.id,
          paymentMethod: method,
          origin: "CARTERA",
          clientName: debt.clientName,
          notes: "Abono - " + debt.concept,
          receiptSeq: await nextReceiptSeq(tx, user.id),
          items: {
            create: [{ userId: user.id, name: "Abono - " + debt.concept, unitPrice: amount, qty: 1 }],
          },
        },
      });
      saleId = sale.id;
    }

    await tx.debtPayment.create({
      data: {
        userId: user.id,
        debtId: debt.id,
        staffId: me.id,
        amount,
        day,
        method,
        notes,
        saleId,
        receiptSeq: await nextReceiptSeq(tx, user.id),
      },
    });

    // Si con este abono queda en cero, la deuda se cierra sola.
    if (amount >= pendiente) {
      await tx.debt.update({ where: { id: debt.id }, data: { status: "PAGADA" } });
    }
    return saleId;
  });
  // Un abono que entra a la caja es una venta de hoy: el dueño se entera.
  if (ventaAbono) after(() => avisarVentaGuardada(user, { tipo: "venta", id: ventaAbono }, me).then(() => undefined));
  await anotarActividad(
    { user, staff: me },
    { tipo: "abono", detalle: "Recibió un abono de " + debt.clientName + " (" + debt.concept + ")", monto: amount }
  );

  refresh(debt.id);
  revalidatePath("/panel/ventas");
  return { ok: amount >= pendiente ? "Deuda pagada por completo." : "Abono registrado." };
}

/** Borra un abono. Si genero una venta, se va con el. Solo el dueño. */
export async function deletePaymentAction(formData: FormData) {
  const { user, staff } = await requireOwner();
  const id = str(formData.get("id"));

  const pago = await db.debtPayment.findFirst({
    where: { id, userId: user.id },
    include: { debt: { select: { id: true, clientName: true, renewedInto: { select: { id: true } } } } },
  });
  if (!pago) return;
  // El saldo que se paso a un prestamo nuevo no se borra suelto: quedaria
  // cobrado dos veces, en el viejo y en el nuevo. Se deshace borrando el nuevo.
  if (pago.renewal && pago.debt.renewedInto) return;

  await db.$transaction(async (tx) => {
    if (pago.saleId) {
      await tx.sale.deleteMany({ where: { id: pago.saleId, userId: user.id } });
    }
    await tx.debtPayment.delete({ where: { id: pago.id } });
    // Al quitar plata la deuda vuelve a estar pendiente.
    await tx.debt.updateMany({
      where: { id: pago.debtId, userId: user.id, status: "PAGADA" },
      data: { status: "PENDIENTE" },
    });
  });
  await anotarActividad({ user, staff }, { tipo: "borrado", detalle: "Borró un abono de " + pago.debt.clientName, monto: pago.amount });

  refresh(pago.debtId);
  revalidatePath("/panel/ventas");
}

/**
 * Agregar productos a un fiado que ya estaba anotado (lo pidio Chopo Snacks):
 * el cliente se lleva algo mas y queda debiendo eso tambien. El fiado no
 * guarda renglones, asi que lo agregado se suma al concepto y al valor. Si ya
 * estaba pagado vuelve a quedar por cobrar. El empleado solo le agrega a los
 * fiados que anoto, que son los unicos que ve.
 */
export async function addDebtItemsAction(debtId: string, pedidos: ItemPedido[]): Promise<DebtState> {
  const { user, staff } = await requireSession();
  const debt = await db.debt.findFirst({
    where: { id: String(debtId), userId: user.id, ...(esDueno(staff.role) ? {} : { staffId: staff.id }) },
    select: { id: true, concept: true, status: true, clientName: true },
  });
  if (!debt) return { error: "No encontramos ese fiado." };
  if (debt.status === "ANULADA") return { error: "Ese fiado está anulado." };

  const r = await itemsParaAgregar(user.id, user.currency, cerosPara(user.businessType), pedidos);
  if ("error" in r) return { error: r.error };
  const suma = r.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const resumen = resumenDeItems(r.items);

  await db.debt.update({
    where: { id: debt.id },
    data: {
      concept: (debt.concept.trim() ? debt.concept.trim() + ", " : "") + resumen,
      amount: { increment: suma },
      ...(debt.status === "PAGADA" ? { status: "PENDIENTE" as const } : {}),
    },
  });
  await anotarActividad(
    { user, staff },
    { tipo: "deuda", detalle: "Agregó al fiado de " + debt.clientName + ": " + resumen, monto: suma }
  );

  refresh(debt.id);
  return { ok: "Se agregó al fiado de " + debt.clientName + "." };
}

/** Deja anotado que ya se le cobro, para no acosar al cliente. */
export async function markCollectedAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  await db.debt.updateMany({
    where: { id, userId: user.id },
    data: { lastReminderAt: new Date() },
  });
  refresh(id);
}

/** Cambiar el vencimiento cuando se acuerda un nuevo plazo. Solo el dueño. */
export async function updateDueDayAction(
  _prev: DebtState,
  formData: FormData
): Promise<DebtState> {
  const { user, staff } = await requireSession();
  if (!esDueno(staff.role)) return { error: SOLO_DUENO };
  const id = str(formData.get("id"));
  const dueInput = str(formData.get("dueDay"));

  if (dueInput && !isValidDay(dueInput)) return { error: "La fecha no es valida." };

  const updated = await db.debt.updateMany({
    where: { id, userId: user.id },
    data: { dueDay: dueInput || null },
  });
  if (updated.count === 0) return { error: "No encontramos esa deuda." };

  refresh(id);
  return { ok: dueInput ? "Nuevo plazo guardado." : "Se quito la fecha de vencimiento." };
}

/** Anular: la deuda se da por perdida o estaba mal anotada. Solo el dueño. */
export async function cancelDebtAction(formData: FormData) {
  const { user, staff } = await requireOwner();
  const id = str(formData.get("id"));
  const deuda = await db.debt.findFirst({ where: { id, userId: user.id }, select: { clientName: true, amount: true } });
  if (!deuda) return;
  await db.debt.updateMany({
    where: { id, userId: user.id },
    data: { status: "ANULADA" },
  });
  await anotarActividad({ user, staff }, { tipo: "cambio", detalle: "Anuló la deuda de " + deuda.clientName, monto: deuda.amount });
  refresh(id);
}

export async function reopenDebtAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  await db.debt.updateMany({
    where: { id, userId: user.id, status: "ANULADA" },
    data: { status: "PENDIENTE" },
  });
  refresh(id);
}

/**
 * Borrar del todo. Solo si no tiene abonos: si ya cobro algo, se anula, para
 * que no se pierda el rastro de la plata que si entro. Solo el dueño.
 */
export async function deleteDebtAction(formData: FormData) {
  const { user, staff } = await requireOwner();
  const id = str(formData.get("id"));
  const deuda = await db.debt.findFirst({
    where: { id, userId: user.id },
    select: { clientName: true, amount: true, renewedFromId: true },
  });
  if (!deuda) return;

  const cuantos = await db.debtPayment.count({ where: { debtId: id, userId: user.id } });
  if (cuantos > 0) {
    await db.debt.updateMany({ where: { id, userId: user.id }, data: { status: "ANULADA" } });
  } else if (deuda.renewedFromId) {
    // Era la renovacion de otro prestamo y no tiene abonos: se deshace la
    // renovacion. El anterior recupera su saldo y vuelve a quedar por cobrar.
    const anterior = deuda.renewedFromId;
    await db.$transaction(async (tx) => {
      await tx.debt.deleteMany({ where: { id, userId: user.id } });
      await tx.debtPayment.deleteMany({ where: { debtId: anterior, userId: user.id, renewal: true } });
      await tx.debt.updateMany({
        where: { id: anterior, userId: user.id, status: "PAGADA" },
        data: { status: "PENDIENTE" },
      });
    });
    revalidatePath("/panel/cartera/" + anterior);
  } else {
    await db.debt.deleteMany({ where: { id, userId: user.id } });
  }
  await anotarActividad(
    { user, staff },
    { tipo: "borrado", detalle: (cuantos > 0 ? "Anuló la deuda de " : "Borró la deuda de ") + deuda.clientName, monto: deuda.amount }
  );

  refresh(id);
}

/**
 * Renovar un prestamo (lo pidio EM Inversiones, ver lib/em-inversiones.ts).
 *
 * Es como lo hace quien presta en la calle: al cliente que viene pagando se le
 * presta otra vez y lo que todavia debe se le descuenta del prestamo nuevo.
 * Recibe en la mano la diferencia.
 *
 * - El anterior se cierra con un abono por lo que debia, marcado `renewal`:
 *   no es plata que entro, asi que no crea venta ni suma a la caja. La plata
 *   de verdad entra con las cuotas del nuevo.
 * - El nuevo copia los datos del cliente, del fiador y de las referencias, y
 *   guarda de cual salio.
 * - Todo en una transaccion. Un prestamo se renueva una sola vez (la columna
 *   es unica), asi que dos toques seguidos no hacen dos renovaciones.
 */
export async function renewLoanAction(_prev: DebtState, formData: FormData): Promise<DebtState> {
  const { user, staff } = await requireSession();
  if (!esEmInversiones(user.businessName)) return { error: "Renovar préstamos no está activo en esta cuenta." };

  const id = str(formData.get("debtId"));
  const vieja = await db.debt.findFirst({
    // El empleado solo renueva los prestamos que anoto, que son los unicos que ve.
    where: { id, userId: user.id, ...(esDueno(staff.role) ? {} : { staffId: staff.id }) },
    include: { payments: { select: { amount: true } }, renewedInto: { select: { id: true } } },
  });
  if (!vieja) return { error: "No encontramos ese préstamo." };
  if (vieja.status === "ANULADA") return { error: "Ese préstamo está anulado." };
  if (vieja.renewedInto) return { error: "Ese préstamo ya se renovó." };

  const debe = saldo(vieja);

  const principal = parseMoney(formData.get("principal"), user.currency);
  if (principal <= 0) return { error: "Escribe cuánto le prestas ahora." };
  if (principal < debe) {
    return {
      error:
        "El préstamo nuevo tiene que cubrir lo que todavía debe (" +
        money(debe, user.currency) +
        "). Escribe una cantidad igual o mayor.",
    };
  }

  const interestPct = Math.max(0, parseIntSafe(formData.get("interestPct"), 0));
  if (interestPct > 500) return { error: "Ese interés no parece real. Revísalo." };

  const installments = parseIntSafe(formData.get("installments"), 0);
  if (installments <= 0) return { error: "Escribe en cuántas cuotas te va a pagar." };
  if (installments > 500) return { error: "Son demasiadas cuotas. Máximo 500." };

  const frequency = str(formData.get("frequency"));
  if (!esFrecuencia(frequency)) return { error: "Elige cada cuánto te paga." };

  const dayInput = str(formData.get("day"));
  const day = isValidDay(dayInput) ? dayInput : todayIn(user.timezone);
  const amount = totalConInteres(principal, interestPct);
  const plan = planDeCuotas({
    total: amount,
    cuotas: installments,
    frecuencia: frequency,
    desde: day,
    ...opcionesPlanDe(user),
  });
  const entrega = principal - debe;

  const numeroViejo = vieja.receiptSeq ? " No. " + formatReceiptSeq(vieja.receiptSeq) : "";
  const nota = texto(formData.get("notes"));
  const notes =
    "Renovación del préstamo" +
    numeroViejo +
    ": se descontó lo que debía (" +
    money(debe, user.currency) +
    ") y se le entregó " +
    money(entrega, user.currency) +
    "." +
    (nota ? " " + nota : "");

  let nueva;
  try {
    nueva = await db.$transaction(async (tx) => {
      if (debe > 0) {
        await tx.debtPayment.create({
          data: {
            userId: user.id,
            debtId: vieja.id,
            staffId: staff.id,
            amount: debe,
            day,
            method: "OTRO",
            notes: "Renovación: el saldo pasó al préstamo nuevo",
            renewal: true,
            receiptSeq: await nextReceiptSeq(tx, user.id),
          },
        });
      }
      await tx.debt.update({ where: { id: vieja.id }, data: { status: "PAGADA" } });

      return tx.debt.create({
        data: {
          userId: user.id,
          staffId: staff.id,
          renewedFromId: vieja.id,
          clientName: vieja.clientName,
          clientPhone: vieja.clientPhone,
          clientAddress: vieja.clientAddress,
          concept: str(formData.get("concept")) || vieja.concept,
          amount,
          day,
          dueDay: plan[plan.length - 1]?.day ?? null,
          notes,
          alreadyInvoiced: vieja.alreadyInvoiced,
          principal,
          interestPct,
          installments,
          frequency,
          guarantorName: vieja.guarantorName,
          guarantorId: vieja.guarantorId,
          guarantorPhone: vieja.guarantorPhone,
          guarantorAddress: vieja.guarantorAddress,
          reference1Name: vieja.reference1Name,
          reference1Phone: vieja.reference1Phone,
          reference2Name: vieja.reference2Name,
          reference2Phone: vieja.reference2Phone,
          receiptSeq: await nextReceiptSeq(tx, user.id),
        },
      });
    });
  } catch (e) {
    // La columna unica: otro toque (u otro telefono) ya lo renovo.
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { error: "Ese préstamo ya se renovó." };
    }
    throw e;
  }

  await anotarActividad(
    { user, staff },
    {
      tipo: "deuda",
      detalle: "Renovó el préstamo de " + vieja.clientName + " (se le entregó " + money(entrega, user.currency) + ")",
      monto: amount,
    }
  );

  refresh(vieja.id);
  revalidatePath("/panel/cartera/" + nueva.id);
  return {
    ok: "Préstamo renovado. Le entregas " + money(entrega, user.currency) + " en la mano.",
    nuevaId: nueva.id,
    recibo: {
      debtId: nueva.id,
      clientName: nueva.clientName,
      clientPhone: nueva.clientPhone,
      concept: nueva.concept,
      amount,
      day,
      receiptSeq: nueva.receiptSeq,
    },
  };
}
