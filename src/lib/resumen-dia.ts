import { db } from "./db";
import { addDays, dayIn, timeIn } from "./dates";
import { money } from "./format";
import { getDaySummary } from "./queries";
import { repartoDelDia } from "./patio-turno";
import { avisarAlDueno, type AvisoPush } from "./push";

/**
 * El resumen del dia que le llega al dueño por notificacion al cierre:
 * "26 carros · $913.030 · Andrea 6, Raul 7...".
 *
 * Usa las mismas cuentas que el Resumen del dia del panel (getDaySummary y
 * repartoDelDia), asi que la notificacion y la pantalla dan la misma cifra.
 *
 * Lo manda el cron una vez al dia (ver vercel.json), solo a los negocios cuyo
 * dueño activo las notificaciones y que vendieron algo ese dia: un "hoy no
 * vendiste nada" todos los dias de descanso es ruido.
 */

/**
 * Que dia se resume. El cron corre a una hora fija en UTC, y en cada zona eso
 * cae distinto: si alla ya es de madrugada, el dia que acaba de cerrar es el
 * de ayer.
 */
export function diaParaResumir(timezone: string, ahora = new Date()): string {
  // dayIn(ahora) y no todayIn(): el dia tiene que salir de la misma hora que
  // la cuenta de abajo, no del reloj del servidor.
  const hoy = dayIn(ahora, timezone);
  const hora = Number(timeIn(ahora, timezone).slice(0, 2));
  return hora < 12 ? addDays(hoy, -1) : hoy;
}

export async function armarResumen(
  user: { id: string; currency: string; businessType: string },
  day: string
): Promise<AvisoPush | null> {
  const resumen = await getDaySummary(user.id, day);
  if (resumen.salesCount === 0) return null;

  const plata = (n: number) => money(n, user.currency);
  const partes: string[] = [];

  if (user.businessType === "LAVADERO") {
    const reparto = await repartoDelDia(user.id, day);
    const carros = [...reparto.porLavador.values()].reduce((sum, f) => sum + f.count, 0);
    const nombres = await db.staff.findMany({
      where: { userId: user.id, id: { in: [...reparto.porLavador.keys()] } },
      select: { id: true, name: true },
    });
    const nombreDe = new Map(nombres.map((p) => [p.id, p.name.split(" ")[0]]));
    const porLavador = [...reparto.porLavador.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([id, f]) => (nombreDe.get(id) ?? "Sin nombre") + " " + f.count)
      .join(", ");

    partes.push(carros + (carros === 1 ? " carro" : " carros") + " · " + plata(resumen.totalSales));
    if (resumen.totalExpenses > 0) partes.push("Gastos " + plata(resumen.totalExpenses));
    if (reparto.lavadores > 0) {
      partes.push("Para lavadores " + plata(reparto.lavadores) + " · Queda " + plata(reparto.lavadero - resumen.totalExpenses));
    }
    if (porLavador) partes.push(porLavador);
  } else {
    partes.push(resumen.salesCount + (resumen.salesCount === 1 ? " venta" : " ventas") + " · " + plata(resumen.totalSales));
    if (resumen.totalExpenses > 0) {
      partes.push("Gastos " + plata(resumen.totalExpenses) + " · Te queda " + plata(resumen.netTotal));
    }
  }

  const cuerpo = partes.join(". ");
  return {
    title: "Resumen del día · " + plata(resumen.totalSales),
    body: cuerpo.length > 230 ? cuerpo.slice(0, 227) + "..." : cuerpo,
    url: "/panel",
    tag: "resumen-" + day,
  };
}

/** Le manda el resumen a cada dueño con notificaciones activas. Devuelve cuantos avisos salieron. */
export async function mandarResumenes(ahora = new Date()) {
  const negocios = await db.pushSubscription.findMany({
    where: { staff: { role: "DUENO", active: true }, user: { suspendedAt: null } },
    distinct: ["userId"],
    select: { user: { select: { id: true, currency: true, businessType: true, timezone: true } } },
  });

  let enviados = 0;
  for (const { user } of negocios) {
    try {
      const aviso = await armarResumen(user, diaParaResumir(user.timezone, ahora));
      if (aviso) enviados += await avisarAlDueno(user.id, aviso);
    } catch (error) {
      // Un negocio que falla no deja sin resumen a los demas.
      console.error("No se pudo armar el resumen del día:", error);
    }
  }
  return enviados;
}
