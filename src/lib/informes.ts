import type { Staff, User } from "@prisma/client";
import { db } from "./db";
import { isValidDay, todayIn } from "./dates";
import { anotarCliente } from "./clientes";
import { avisarAlAdministrador } from "./avisos-admin";

/**
 * Los reportes de visita, del lado del servidor.
 *
 * Lo usan las rutas que recibe la cola del telefono (/api/informes/...) y las
 * pantallas. Las reglas viven aqui para que valgan igual con senal o sin ella.
 */

/** Mas fotos que esto hace un PDF que WhatsApp ya no deja mandar comodo. */
export const MAX_FOTOS = 12;

/**
 * Peso maximo de una foto ya reducida, como texto data URL. El telefono la
 * achica antes (unos 450 KB); esto es por si llega algo que no paso por ahi.
 */
export const MAX_LARGO_FOTO = 700_000;

/** Solo formatos que se pintan y no se ejecutan. Ver lib/imagen-servida.ts. */
export const FOTO_VALIDA = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

export const LLAVE_VALIDA = /^[A-Za-z0-9-]{8,64}$/;
const LLAVE_FOTO = /^[A-Za-z0-9-]{8,64}:\d{1,2}$/;

export type Sesion = { user: User; staff: Staff };
export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; status: number };

export const falla = (error: string, status = 400) => ({ ok: false as const, error, status });
export const textoDe = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** El administrador ve todos; el empleado, solo los que hizo el. */
export function puedeVerInforme(
  staff: { id: string; role: string },
  informe: { createdByStaffId: string | null }
): boolean {
  return staff.role === "DUENO" || informe.createdByStaffId === staff.id;
}

export async function crearInforme(s: Sesion, d: Record<string, unknown>): Promise<Resultado<{ id: string; repetido: boolean }>> {
  const clientKey = typeof d.clientKey === "string" && LLAVE_VALIDA.test(d.clientKey) ? d.clientKey : null;
  if (d.clientKey !== undefined && d.clientKey !== null && !clientKey) return falla("Llave inválida.");

  // Si ya llego en un intento anterior que se corto, se responde lo mismo.
  const yaEsta = async () => {
    if (!clientKey) return null;
    const ya = await db.visitReport.findUnique({ where: { clientKey }, select: { id: true, userId: true } });
    if (!ya) return null;
    return ya.userId === s.user.id ? { ok: true as const, datos: { id: ya.id, repetido: true } } : falla("Ese reporte no se puede recibir.", 409);
  };
  const previo = await yaEsta();
  if (previo) return previo;

  const title = textoDe(d.title, 200);
  if (!title) return falla("Escribe un título para el reporte.");

  const dayIn = textoDe(d.day, 10);
  const day = isValidDay(dayIn) ? dayIn : todayIn(s.user.timezone);

  const siteId = textoDe(d.siteId, 40) || null;
  if (siteId) {
    const sitio = await db.workSite.findFirst({ where: { id: siteId, userId: s.user.id }, select: { id: true } });
    if (!sitio) return falla("Ese sitio no existe.");
  }

  let informe;
  try {
    informe = await db.visitReport.create({
      data: {
        userId: s.user.id,
        siteId,
        day,
        title,
        body: textoDe(d.body, 4000) || null,
        clientName: textoDe(d.clientName, 200) || null,
        clientPhone: textoDe(d.clientPhone, 40) || null,
        createdByStaffId: s.staff.id,
        clientKey,
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      const carrera = await yaEsta();
      if (carrera) return carrera;
    }
    throw e;
  }

  if (informe.clientName) {
    await anotarCliente(s.user.id, { name: informe.clientName, phone: informe.clientPhone, source: "reporte" });
  }
  return { ok: true, datos: { id: informe.id, repetido: false } };
}

async function informeVisible(s: Sesion, reportId: string) {
  const informe = await db.visitReport.findFirst({
    where: { id: reportId, userId: s.user.id },
    select: {
      id: true,
      title: true,
      sentAt: true,
      createdByStaffId: true,
      site: { select: { name: true } },
      _count: { select: { photos: true } },
    },
  });
  return informe && puedeVerInforme(s.staff, informe) ? informe : null;
}

export async function agregarFoto(
  s: Sesion,
  reportId: string,
  d: Record<string, unknown>
): Promise<Resultado<{ id: string; repetido: boolean }>> {
  const informe = await informeVisible(s, reportId);
  if (!informe) return falla("Ese reporte no existe.", 404);

  const clientKey = typeof d.clientKey === "string" && LLAVE_FOTO.test(d.clientKey) ? d.clientKey : null;
  if (clientKey) {
    const ya = await db.visitPhoto.findUnique({ where: { clientKey }, select: { id: true, reportId: true } });
    if (ya) {
      return ya.reportId === informe.id ? { ok: true, datos: { id: ya.id, repetido: true } } : falla("Esa foto no se puede recibir.", 409);
    }
  }

  if (informe._count.photos >= MAX_FOTOS) {
    return falla("El reporte ya tiene " + MAX_FOTOS + " fotos, que es el máximo.");
  }
  const image = typeof d.image === "string" ? d.image : "";
  if (image.length > MAX_LARGO_FOTO) return falla("La foto pesa demasiado.");
  if (!FOTO_VALIDA.test(image)) return falla("Eso no es una foto en un formato válido.");

  try {
    const foto = await db.visitPhoto.create({
      data: {
        userId: s.user.id,
        reportId: informe.id,
        image,
        caption: textoDe(d.caption, 120) || null,
        sort: informe._count.photos,
        clientKey,
      },
      select: { id: true },
    });
    return { ok: true, datos: { id: foto.id, repetido: false } };
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002" && clientKey) {
      const ya = await db.visitPhoto.findUnique({ where: { clientKey }, select: { id: true } });
      if (ya) return { ok: true, datos: { id: ya.id, repetido: true } };
    }
    throw e;
  }
}

/**
 * El reporte quedo completo: desde ahora le aparece al administrador como
 * nuevo, y se le avisa. Enviarlo dos veces no avisa dos veces.
 */
export async function enviarInforme(s: Sesion, reportId: string): Promise<Resultado<{ yaEstaba: boolean }>> {
  const informe = await informeVisible(s, reportId);
  if (!informe) return falla("Ese reporte no existe.", 404);
  if (informe.sentAt) return { ok: true, datos: { yaEstaba: true } };

  const esDueno = s.staff.role === "DUENO";
  const ahora = new Date();
  const marcado = await db.visitReport.updateMany({
    where: { id: informe.id, sentAt: null },
    // Si lo hizo el mismo administrador, no tiene nada nuevo que revisar.
    data: { sentAt: ahora, ...(esDueno ? { seenAt: ahora } : {}) },
  });

  if (marcado.count > 0 && !esDueno) {
    const fotos = informe._count.photos;
    await avisarAlAdministrador(s.user, {
      asunto: "Nuevo reporte de " + s.staff.name + ": " + informe.title,
      texto:
        s.staff.name +
        " envió el reporte «" +
        informe.title +
        "»" +
        (informe.site ? " de " + informe.site.name : "") +
        " con " +
        fotos +
        (fotos === 1 ? " foto." : " fotos."),
      ruta: "/panel/informes/" + informe.id,
    });
  }
  return { ok: true, datos: { yaEstaba: marcado.count === 0 } };
}
