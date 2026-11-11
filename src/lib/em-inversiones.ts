import { normalizar } from "./orden-productos";
import type { OpcionesPlan } from "./prestamos";

/**
 * EM Inversiones (Emerson): negocio de cartera, presta y cobra por cuotas.
 *
 * Lo que pidio el 10 nov 2026 es solo para su cuenta, igual que lo de Chopo
 * Snacks (ver lib/chopo.ts):
 *
 * - Domingos y festivos no se cobra: el plan de cuotas los salta y la cuota
 *   que todavia no se ha pagado HOY no cuenta como atraso.
 * - El cobro del dia (/panel/cartera/cobro): todos los recibos de quienes
 *   tienen que pagar ese dia, para imprimirlos de una, y la planilla para el
 *   cobrador.
 * - Recibos de abono mas cortos y con la cuota en que va.
 * - Renovar un prestamo: uno nuevo al mismo cliente, descontando lo que
 *   debia del anterior.
 *
 * Se reconoce por el nombre del negocio, con o sin espacio ("EM INVERSIONES",
 * "eminversiones"), igual que Chopo Snacks por el suyo. Si le cambian el
 * nombre en Configuracion, deja de tenerlo.
 */
export function esEmInversiones(nombreNegocio: string): boolean {
  return normalizar(nombreNegocio).replace(/ /g, "") === "eminversiones";
}

/**
 * Como se arma el plan de cuotas de ese negocio. Para todos los demas es el
 * de siempre (cuota cada tantos dias corridos).
 */
export function opcionesPlanDe(user: { businessName: string; country?: string | null }): OpcionesPlan {
  return esEmInversiones(user.businessName)
    ? { soloDiasDeCobro: true, pais: user.country || "CO" }
    : {};
}
