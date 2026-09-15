import { SUPPORT_WHATSAPP } from "./support";

/**
 * El plan de una cuenta: completa o version gratis.
 *
 *   - Con fecha de pago manda el control de pagos (lib/pagos.ts): mientras no
 *     se suspenda, la cuenta tiene todo. Es la unica que instala la
 *     aplicacion en el telefono y la usa sin senal (puedeInstalar).
 *   - Sin fecha de pago y sin prueba: cuenta de cortesia, o de antes de que
 *     existiera la prueba. Tiene todo menos instalar la aplicacion.
 *   - Sin fecha de pago y con prueba: todo menos instalar hasta que se acaba la prueba, y
 *     despues la version gratis hasta que el administrador registre el pago.
 *
 * La version gratis se usa desde el navegador y con internet: no se instala
 * como aplicacion ni guarda nada para usar sin senal, no tiene factura
 * autorizada, ubicacion del personal, carga masiva, reportes ni exportar, y
 * sus facturas salen con la marca de la version gratis.
 */

export const DIAS_DE_PRUEBA = 7;
const DIA = 86_400_000;

export type Plan =
  | { tipo: "pago" }
  | { tipo: "cortesia" }
  | { tipo: "prueba"; hasta: Date; dias: number }
  | { tipo: "gratis"; desde: Date };

export type CuentaConPlan = { paidUntil: Date | null; trialEndsAt: Date | null };

export function planDeCuenta(c: CuentaConPlan, ahora = new Date()): Plan {
  if (c.paidUntil) return { tipo: "pago" };
  if (!c.trialEndsAt) return { tipo: "cortesia" };
  const falta = c.trialEndsAt.getTime() - ahora.getTime();
  if (falta > 0) return { tipo: "prueba", hasta: c.trialEndsAt, dias: Math.ceil(falta / DIA) };
  return { tipo: "gratis", desde: c.trialEndsAt };
}

/** Si tiene todo: todo menos la version gratis. */
export function esPlanCompleto(c: CuentaConPlan, ahora = new Date()): boolean {
  return planDeCuenta(c, ahora).tipo !== "gratis";
}

/**
 * Si puede instalar la aplicacion en el telefono y usarla sin senal: solo la
 * cuenta que pago. La prueba y la cortesia la usan desde el navegador. Una
 * cuenta con el pago vencido la bloquea el control de pagos (lib/pagos.ts).
 */
export function puedeInstalar(c: CuentaConPlan, ahora = new Date()): boolean {
  return planDeCuenta(c, ahora).tipo === "pago";
}

/** Hasta cuando va la prueba de una cuenta que se registra ahora. */
export function finDePrueba(ahora = new Date()): Date {
  return new Date(ahora.getTime() + DIAS_DE_PRUEBA * DIA);
}

export const SOLO_PLAN_PAGO = "Esta función no está activa en tu cuenta. Escríbenos a soporte si la necesitas.";

/** La marca de las facturas y recibos de la version gratis. */
export const MARCA_VERSION_GRATIS = "Hecho con Todoen1";

/** Para acciones y rutas: el motivo si la cuenta esta en la version gratis, o null si puede. */
export function motivoSinPlan(c: CuentaConPlan): string | null {
  return esPlanCompleto(c) ? null : SOLO_PLAN_PAGO;
}

/** El WhatsApp de soporte con el mensaje para activar el plan ya escrito. */
export function enlaceActivarPlan(businessName: string): string {
  return "https://wa.me/" + SUPPORT_WHATSAPP + "?text=" + encodeURIComponent("Hola, necesito ayuda con la cuenta de " + businessName + ".");
}
