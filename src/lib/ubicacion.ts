import { db } from "./db";
import { distanciaM } from "./geo";
import type { Sesion } from "./informes";
import { SOLO_PLAN_PAGO, esPlanCompleto } from "./plan";

/**
 * La ubicacion del personal durante la jornada, y las llegadas ("Llegue").
 *
 * Tres condiciones para guardar una ubicacion, y las tres las revisa el
 * servidor aunque el telefono ya las haya revisado:
 *   1. el negocio lo tiene activado,
 *   2. la persona lo acepto,
 *   3. estaba en su jornada: la ubicacion es de despues de su entrada y antes
 *      de su salida.
 * Fuera de eso no se guarda nada. Seguir a alguien fuera del trabajo no es
 * algo que esta aplicacion haga, ni por error.
 *
 * La llegada es distinta: es la persona tocando un boton, igual que marcar la
 * entrada, asi que se guarda siempre, con o sin seguimiento activado.
 */

/** Cada cuanto manda el telefono su ubicacion. */
export const MINUTOS_ENTRE_UBICACIONES = 3;
/** Dos ubicaciones mas juntas que esto se toman como la misma. */
const SEPARACION_MINIMA_MS = 60_000;
/** Una jornada no dura mas que esto: igual que en lib/jornada-reglas.ts. */
const VENTANA_JORNADA_MS = 20 * 60 * 60 * 1000;
const MINUTOS_DE_GRACIA = 5;
const DIAS_ATRAS = 8;
/** Pasado esto, el recorrido ya no hace falta y se borra. */
export const DIAS_GUARDADAS = 90;
export const MAX_LOTE = 100;

export type ResultadoItem = { clientKey: string; estado: "guardado" | "repetido" | "rechazado"; motivo?: string };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const llaveDe = (v: unknown) => (typeof v === "string" ? v.slice(0, 100) : "");

function fechaValida(v: unknown): Date | null {
  const d = typeof v === "string" ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const ahora = Date.now();
  if (d.getTime() > ahora + MINUTOS_DE_GRACIA * 60_000) return null;
  if (d.getTime() < ahora - DIAS_ATRAS * 86_400_000) return null;
  return d;
}

/** Si la persona tenia una entrada abierta en ese momento. */
async function enJornada(staffId: string, momento: Date): Promise<boolean> {
  const ultimo = await db.attendance.findFirst({
    where: {
      staffId,
      voidedAt: null,
      markedAt: { lte: momento, gte: new Date(momento.getTime() - VENTANA_JORNADA_MS) },
    },
    orderBy: { markedAt: "desc" },
    select: { kind: true },
  });
  return ultimo?.kind === "ENTRADA";
}

export async function recibirUbicaciones(s: Sesion, lote: unknown[]): Promise<ResultadoItem[]> {
  const resultados: ResultadoItem[] = [];
  // Se lee otra vez de la base: la sesion puede traer datos de antes del cambio.
  const [negocio, persona] = await Promise.all([
    db.user.findUnique({ where: { id: s.user.id }, select: { liveTracking: true, paidUntil: true, trialEndsAt: true } }),
    db.staff.findUnique({ where: { id: s.staff.id }, select: { locationConsentAt: true } }),
  ]);
  const motivoGeneral = negocio && !esPlanCompleto(negocio)
    ? SOLO_PLAN_PAGO
    : !negocio?.liveTracking
    ? "El negocio no tiene activada la ubicación durante la jornada."
    : !persona?.locationConsentAt
      ? "No has aceptado compartir tu ubicación."
      : null;

  const ordenados = [...lote].sort((a, b) =>
    String((a as Record<string, unknown>)?.at ?? "").localeCompare(String((b as Record<string, unknown>)?.at ?? ""))
  );
  let anterior: Date | null = null;

  for (const crudo of ordenados) {
    const u = (crudo ?? {}) as Record<string, unknown>;
    const clientKey = llaveDe(u.clientKey);
    if (!clientKey) continue;
    const rechazar = (motivo: string) => resultados.push({ clientKey, estado: "rechazado", motivo });
    if (motivoGeneral) {
      rechazar(motivoGeneral);
      continue;
    }

    const ya = await db.locationPing.findUnique({ where: { clientKey }, select: { staffId: true } });
    if (ya) {
      if (ya.staffId === s.staff.id) resultados.push({ clientKey, estado: "repetido" });
      else rechazar("Esa ubicación no se puede recibir.");
      continue;
    }

    const at = fechaValida(u.at);
    const lat = num(u.lat);
    const lng = num(u.lng);
    if (!at) {
      rechazar("La hora no es válida.");
      continue;
    }
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      rechazar("La coordenada no es válida.");
      continue;
    }
    if (!(await enJornada(s.staff.id, at))) {
      rechazar("Fuera de la jornada: la ubicación solo se guarda entre la entrada y la salida.");
      continue;
    }

    // Mas seguido que cada minuto no aporta nada y llena la base.
    if (!anterior) {
      const ultima = await db.locationPing.findFirst({
        where: { staffId: s.staff.id, at: { lte: at } },
        orderBy: { at: "desc" },
        select: { at: true },
      });
      anterior = ultima?.at ?? null;
    }
    if (anterior && at.getTime() - anterior.getTime() < SEPARACION_MINIMA_MS) {
      resultados.push({ clientKey, estado: "repetido" });
      continue;
    }

    try {
      await db.locationPing.create({
        data: {
          userId: s.user.id,
          staffId: s.staff.id,
          at,
          lat,
          lng,
          accuracyM: num(u.accuracyM) !== null ? Math.round(num(u.accuracyM)!) : null,
          clientKey,
        },
      });
      anterior = at;
      resultados.push({ clientKey, estado: "guardado" });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") resultados.push({ clientKey, estado: "repetido" });
      else throw e;
    }
  }
  return resultados;
}

export async function registrarVisitas(s: Sesion, lote: unknown[]): Promise<ResultadoItem[]> {
  const resultados: ResultadoItem[] = [];
  const sitios = await db.workSite.findMany({ where: { userId: s.user.id }, select: { id: true, lat: true, lng: true } });
  // El boton "Llegue" es del plan completo.
  const negocio = await db.user.findUnique({ where: { id: s.user.id }, select: { paidUntil: true, trialEndsAt: true } });
  const sinPlan = negocio && !esPlanCompleto(negocio) ? SOLO_PLAN_PAGO : null;

  for (const crudo of lote) {
    const v = (crudo ?? {}) as Record<string, unknown>;
    const clientKey = llaveDe(v.clientKey);
    if (!clientKey) continue;
    const rechazar = (motivo: string) => resultados.push({ clientKey, estado: "rechazado", motivo });
    if (sinPlan) {
      rechazar(sinPlan);
      continue;
    }

    const ya = await db.siteVisit.findUnique({ where: { clientKey }, select: { staffId: true } });
    if (ya) {
      if (ya.staffId === s.staff.id) resultados.push({ clientKey, estado: "repetido" });
      else rechazar("Esa llegada no se puede recibir.");
      continue;
    }

    const arrivedAt = fechaValida(v.arrivedAt);
    if (!arrivedAt) {
      rechazar("La hora de la llegada no es válida.");
      continue;
    }
    const siteId = typeof v.siteId === "string" && v.siteId ? v.siteId : null;
    const sitio = siteId ? sitios.find((x) => x.id === siteId) : null;
    if (siteId && !sitio) {
      rechazar("Ese sitio no existe en esta cuenta.");
      continue;
    }
    const place = typeof v.place === "string" ? v.place.trim().slice(0, 120) : "";
    if (!sitio && !place) {
      rechazar("Falta decir a dónde llegaste.");
      continue;
    }

    const lat = num(v.lat);
    const lng = num(v.lng);
    const coordenada = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const distanceM =
      coordenada && sitio && sitio.lat !== null && sitio.lng !== null ? Math.round(distanciaM(lat!, lng!, sitio.lat, sitio.lng)) : null;

    try {
      await db.siteVisit.create({
        data: {
          userId: s.user.id,
          // Llega siempre la persona de la sesion, nunca otra.
          staffId: s.staff.id,
          siteId: sitio?.id ?? null,
          place: place || null,
          note: typeof v.note === "string" ? v.note.trim().slice(0, 300) || null : null,
          arrivedAt,
          lat: coordenada ? lat : null,
          lng: coordenada ? lng : null,
          accuracyM: num(v.accuracyM) !== null ? Math.round(num(v.accuracyM)!) : null,
          distanceM,
          clientKey,
        },
      });
      resultados.push({ clientKey, estado: "guardado" });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") resultados.push({ clientKey, estado: "repetido" });
      else throw e;
    }
  }
  return resultados;
}

/** Aceptar o retirar el permiso. Retirarlo borra el "si": no se envia nada mas. */
export async function guardarConsentimiento(staffId: string, acepta: boolean): Promise<void> {
  await db.staff.update({ where: { id: staffId }, data: { locationConsentAt: acepta ? new Date() : null } });
}

export async function cambiarSeguimiento(userId: string, activo: boolean): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { liveTracking: activo } });
}

/** El recorrido no se guarda para siempre: pasado un tiempo ya no sirve. */
export async function borrarUbicacionesViejas(): Promise<number> {
  const r = await db.locationPing.deleteMany({ where: { at: { lt: new Date(Date.now() - DIAS_GUARDADAS * 86_400_000) } } });
  return r.count;
}
