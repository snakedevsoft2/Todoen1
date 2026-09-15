import { db } from "./db";

/**
 * El control de pagos de las cuentas.
 *
 * Cada cuenta tiene hasta cuando esta pagada. Unos dias antes, el dueno ve el
 * aviso en su panel. Si vence, tiene unos dias de gracia con el aviso de
 * cuando se suspende; pasados esos dias, la cuenta se suspende sola: en el
 * envio diario, o en la siguiente pantalla que abra alguien de esa cuenta.
 *
 * Registrar el pago mueve la fecha y, si la suspension fue por el pago, la
 * cuenta vuelve a quedar activa de una. Una suspension manual (por otro
 * motivo) no la levanta un pago: esa la levanta el administrador.
 *
 * Sin fecha no hay control: cuentas de cortesia o de antes del control.
 */

export const DIAS_DE_AVISO = 7;
export const DIAS_DE_GRACIA = 5;
/**
 * Cuantos dias puede usarse la app sin conectarse. El numero que se aplica es
 * el de public/sw.js (MAX_DIAS_SIN_CONEXION): tienen que ser iguales.
 */
export const MAX_DIAS_SIN_CONEXION = 15;
export const MOTIVO_PAGO = "Pago vencido";

const DIA = 86_400_000;
const ZONA = "America/Bogota";

export type EstadoPago =
  | { estado: "sin-control" }
  | { estado: "al-dia"; vence: Date; dias: number }
  | { estado: "por-vencer"; vence: Date; dias: number }
  /** Ya vencio, pero todavia esta en los dias de gracia. */
  | { estado: "vencida"; vence: Date; suspendeEl: Date; dias: number }
  | { estado: "suspender"; vence: Date };

export function estadoDePago(paidUntil: Date | null | undefined, ahora = new Date()): EstadoPago {
  if (!paidUntil) return { estado: "sin-control" };
  const falta = paidUntil.getTime() - ahora.getTime();
  const dias = Math.ceil(falta / DIA);
  if (falta >= 0) return dias > DIAS_DE_AVISO ? { estado: "al-dia", vence: paidUntil, dias } : { estado: "por-vencer", vence: paidUntil, dias };
  const suspendeEl = new Date(paidUntil.getTime() + DIAS_DE_GRACIA * DIA);
  if (ahora.getTime() < suspendeEl.getTime()) {
    return { estado: "vencida", vence: paidUntil, suspendeEl, dias: Math.ceil((suspendeEl.getTime() - ahora.getTime()) / DIA) };
  }
  return { estado: "suspender", vence: paidUntil };
}

/** "14 de octubre de 2026", en la hora de Colombia. */
export function fechaLarga(d: Date): string {
  return d.toLocaleDateString("es-CO", { timeZone: ZONA, day: "numeric", month: "long", year: "numeric" });
}

/** El final de ese dia en Colombia: "pagada hasta el 14" incluye todo el 14. */
export function finDelDia(dia: string): Date {
  return new Date(dia + "T23:59:59.999-05:00");
}

function diaEnColombia(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Suma meses sin saltarse al mes siguiente: el 31 de enero mas un mes es el 28 o 29 de febrero. */
export function sumarMeses(base: Date, meses: number): Date {
  const [a, m, d] = diaEnColombia(base).split("-").map(Number);
  const destino = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return finDelDia(
    destino.getUTCFullYear() + "-" + String(destino.getUTCMonth() + 1).padStart(2, "0") + "-" + String(dia).padStart(2, "0")
  );
}

const datosSuspension = (ahora: Date) => ({ suspendedAt: ahora, suspendedReason: MOTIVO_PAGO, suspendedForPayment: true });

/** Suspende todas las cuentas que pasaron los dias de gracia sin renovar. */
export async function suspenderVencidas(ahora = new Date()): Promise<number> {
  const r = await db.user.updateMany({
    where: { paidUntil: { lt: new Date(ahora.getTime() - DIAS_DE_GRACIA * DIA) }, suspendedAt: null },
    data: datosSuspension(ahora),
  });
  return r.count;
}

/** Si esta cuenta ya paso la gracia, se suspende en este momento. Devuelve si la suspendio. */
export async function suspenderSiVencio(user: { id: string; paidUntil: Date | null; suspendedAt: Date | null }): Promise<boolean> {
  if (user.suspendedAt || estadoDePago(user.paidUntil).estado !== "suspender") return false;
  await db.user.updateMany({ where: { id: user.id, suspendedAt: null }, data: datosSuspension(new Date()) });
  return true;
}

export async function registrarPago(
  userId: string,
  pago: { meses?: number; hasta?: string; nota?: string }
): Promise<{ ok: true; paidUntil: Date; reactivada: boolean } | { ok: false; error: string }> {
  const cuenta = await db.user.findUnique({
    where: { id: userId },
    select: { paidUntil: true, suspendedAt: true, suspendedForPayment: true },
  });
  if (!cuenta) return { ok: false, error: "No existe esa cuenta." };

  let nueva: Date;
  if (pago.hasta !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pago.hasta)) return { ok: false, error: "Elige la fecha hasta la que queda pagada." };
    nueva = finDelDia(pago.hasta);
  } else if (pago.meses && Number.isInteger(pago.meses) && pago.meses > 0 && pago.meses <= 36) {
    // Quien paga antes de que venza no pierde los dias que le quedaban.
    const ahora = new Date();
    const base = cuenta.paidUntil && cuenta.paidUntil.getTime() > ahora.getTime() ? cuenta.paidUntil : ahora;
    nueva = sumarMeses(base, pago.meses);
  } else {
    return { ok: false, error: "Elige cuánto tiempo pagó." };
  }

  // Solo se levanta la suspension que puso el control de pagos, y solo si con
  // la fecha nueva ya no toca suspender.
  const reactivada = Boolean(cuenta.suspendedAt && cuenta.suspendedForPayment && estadoDePago(nueva).estado !== "suspender");
  await db.user.update({
    where: { id: userId },
    data: {
      paidUntil: nueva,
      ...(pago.nota !== undefined ? { billingNote: pago.nota.trim().slice(0, 300) || null } : {}),
      ...(reactivada ? { suspendedAt: null, suspendedReason: null, suspendedForPayment: false } : {}),
    },
  });
  return { ok: true, paidUntil: nueva, reactivada };
}

/** La cuenta queda sin fecha de pago (cortesia). Si estaba suspendida por pago, se reactiva. */
export async function quitarControlDePago(userId: string): Promise<void> {
  const cuenta = await db.user.findUnique({ where: { id: userId }, select: { suspendedForPayment: true, suspendedAt: true } });
  if (!cuenta) return;
  await db.user.update({
    where: { id: userId },
    data: {
      paidUntil: null,
      // Cortesia de verdad: sin una prueba que se acabe y la deje en la version gratis.
      trialEndsAt: null,
      ...(cuenta.suspendedAt && cuenta.suspendedForPayment ? { suspendedAt: null, suspendedReason: null, suspendedForPayment: false } : {}),
    },
  });
}
