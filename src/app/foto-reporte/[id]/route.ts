import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { servirImagen } from "@/lib/imagen-servida";
import { puedeVerInforme } from "@/lib/informes";

/**
 * Sirve una foto de un reporte de visita.
 *
 * A diferencia de la foto de una prenda (/foto/[id]), que el negocio quiere
 * mostrar en publico, esta es del trabajo hecho para un cliente: la fachada de
 * un edificio, el interior de una obra. Por eso pide sesion, solo la entrega a
 * la cuenta duena del reporte, y al empleado solo si el reporte es suyo. Un id
 * ajeno responde lo mismo que uno inventado, para no confirmar que existe.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getCurrentSession();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  const { id } = await params;
  const foto = await db.visitPhoto.findFirst({
    where: { id, userId: sesion.user.id },
    select: { image: true, report: { select: { createdByStaffId: true } } },
  });
  if (!foto || !puedeVerInforme(sesion.staff, foto.report)) return new NextResponse("Sin foto", { status: 404 });

  const respuesta = servirImagen(foto.image);
  // Privada: que ningun cache compartido la guarde para otro.
  respuesta.headers.set("Cache-Control", "private, max-age=3600");
  return respuesta;
}
