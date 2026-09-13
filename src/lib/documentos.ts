import { db } from "./db";
import { MAX_BYTES_PDF, PDF_VALIDO, esPdfDeVerdad, falla, textoDe, type Resultado, type Sesion } from "./informes";

/**
 * Los documentos escaneados que se guardan en la cuenta.
 *
 * El PDF se arma en el telefono; aqui solo se revisa que sea un PDF de verdad
 * y que no pase del tope, igual que las evidencias de los reportes.
 */

/** Documentos guardados por negocio. Un tope para que la base no crezca sin control. */
export const MAX_DOCUMENTOS = 300;

export function puedeVerDocumento(staff: { id: string; role: string }, doc: { staffId: string | null }): boolean {
  return staff.role === "DUENO" || doc.staffId === staff.id;
}

export async function guardarDocumento(s: Sesion, d: Record<string, unknown>): Promise<Resultado<{ id: string }>> {
  const pdf = typeof d.pdf === "string" ? d.pdf : "";
  if (!PDF_VALIDO.test(pdf) || !esPdfDeVerdad(pdf)) return falla("Eso no es un PDF válido.");
  const size = Math.floor(((pdf.length - pdf.indexOf(",") - 1) * 3) / 4);
  if (size > MAX_BYTES_PDF) {
    return falla("El documento pesa más de 3 MB. Descárgalo, o guárdalo con menos páginas.");
  }

  const pages = Math.round(Number(d.pages));
  if (!Number.isFinite(pages) || pages < 1 || pages > 50) return falla("El número de páginas no es válido.");

  const cuantos = await db.scanDocument.count({ where: { userId: s.user.id } });
  if (cuantos >= MAX_DOCUMENTOS) {
    return falla("Ya tienes " + MAX_DOCUMENTOS + " documentos guardados. Borra los que no uses.");
  }

  const documento = await db.scanDocument.create({
    data: {
      userId: s.user.id,
      staffId: s.staff.id,
      title: textoDe(d.title, 120) || "Documento escaneado",
      pdf,
      size,
      pages,
      text: textoDe(d.text, 100_000) || null,
    },
    select: { id: true },
  });
  return { ok: true, datos: { id: documento.id } };
}

export async function borrarDocumento(s: Sesion, id: string): Promise<boolean> {
  const doc = await db.scanDocument.findFirst({ where: { id, userId: s.user.id }, select: { id: true, staffId: true } });
  if (!doc || !puedeVerDocumento(s.staff, doc)) return false;
  await db.scanDocument.delete({ where: { id: doc.id } });
  return true;
}
