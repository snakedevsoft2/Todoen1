"use server";

import { anotarCliente } from "@/lib/clientes";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwner, requireSession } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { str, texto } from "@/lib/format";

export type InformeState = { error?: string; ok?: string } | undefined;

/** Mas fotos que esto hace un PDF que WhatsApp ya no deja mandar comodo. */
const MAX_FOTOS = 12;

/**
 * Peso maximo de una foto ya reducida, como texto data URL.
 *
 * El telefono la achica antes de mandarla (unos 450 KB). Esto es el tope del
 * servidor por si llega algo que no paso por ahi.
 */
const MAX_LARGO_FOTO = 700_000;

/** Solo formatos que se pintan y no se ejecutan. Ver lib/imagen-servida.ts. */
const FOTO_VALIDA = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

export async function crearInformeAction(
  _prev: InformeState,
  formData: FormData
): Promise<InformeState> {
  const { user, staff } = await requireSession();

  const title = str(formData.get("title"));
  if (!title) return { error: "Escribe un titulo para el reporte." };

  const dayInput = str(formData.get("day"));
  const day = isValidDay(dayInput) ? dayInput : todayIn(user.timezone);

  const siteId = str(formData.get("siteId")) || null;
  if (siteId) {
    const sitio = await db.workSite.findFirst({ where: { id: siteId, userId: user.id }, select: { id: true } });
    if (!sitio) return { error: "Ese sitio no existe." };
  }

  const informe = await db.visitReport.create({
    data: {
      userId: user.id,
      siteId,
      day,
      title,
      body: texto(formData.get("body"), 4000) || null,
      clientName: str(formData.get("clientName")) || null,
      clientPhone: str(formData.get("clientPhone"), "", 40) || null,
      createdByStaffId: staff.id,
    },
  });

  if (informe.clientName) {
    await anotarCliente(user.id, { name: informe.clientName, phone: informe.clientPhone, source: "reporte" });
  }

  revalidatePath("/panel/informes");
  redirect("/panel/informes/" + informe.id);
}

/**
 * Una foto por llamada, a proposito.
 *
 * Mandar las doce de una sola vez pasaria el limite de tamano de lo que el
 * servidor acepta por peticion, y con mala senal se perderian todas si se
 * corta. Una por una, la que sube queda subida.
 */
export async function agregarFotoAction(
  _prev: InformeState,
  formData: FormData
): Promise<InformeState> {
  const { user } = await requireSession();

  const reportId = str(formData.get("reportId"));
  const informe = await db.visitReport.findFirst({
    where: { id: reportId, userId: user.id },
    select: { id: true, _count: { select: { photos: true } } },
  });
  if (!informe) return { error: "Ese reporte no existe." };
  if (informe._count.photos >= MAX_FOTOS) {
    return { error: "El reporte ya tiene " + MAX_FOTOS + " fotos, que es el maximo." };
  }

  const image = String(formData.get("image") ?? "");
  if (image.length > MAX_LARGO_FOTO) return { error: "La foto pesa demasiado." };
  if (!FOTO_VALIDA.test(image)) return { error: "Eso no es una foto en un formato valido." };

  await db.visitPhoto.create({
    data: {
      userId: user.id,
      reportId: informe.id,
      image,
      caption: str(formData.get("caption"), "", 120) || null,
      sort: informe._count.photos,
    },
  });

  revalidatePath("/panel/informes/" + informe.id);
  return { ok: "Foto agregada." };
}

/** La borra el dueno o quien hizo el reporte. */
export async function borrarFotoAction(formData: FormData): Promise<void> {
  const { user, staff } = await requireSession();
  const id = str(formData.get("id"));

  const foto = await db.visitPhoto.findFirst({
    where: { id, userId: user.id },
    select: { id: true, reportId: true, report: { select: { createdByStaffId: true } } },
  });
  if (!foto) return;
  if (staff.role !== "DUENO" && foto.report.createdByStaffId !== staff.id) return;

  await db.visitPhoto.delete({ where: { id: foto.id } });
  revalidatePath("/panel/informes/" + foto.reportId);
}

export async function borrarInformeAction(formData: FormData): Promise<void> {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  await db.visitReport.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/panel/informes");
  redirect("/panel/informes");
}
