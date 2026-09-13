import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { puedeVerInforme } from "@/lib/informes";

/**
 * Sirve un PDF de evidencia de un reporte.
 *
 * Con las mismas reglas que las fotos del reporte: sesion, cuenta duena, y al
 * empleado solo si el reporte es suyo. Un id ajeno responde 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getCurrentSession();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  const { id } = await params;
  const adjunto = await db.visitAttachment.findFirst({
    where: { id, userId: sesion.user.id },
    select: { name: true, data: true, report: { select: { createdByStaffId: true } } },
  });
  if (!adjunto || !puedeVerInforme(sesion.staff, adjunto.report)) {
    return new NextResponse("Sin archivo", { status: 404 });
  }

  const bytes = Buffer.from(adjunto.data.slice(adjunto.data.indexOf(",") + 1), "base64");
  const nombre = adjunto.name.replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="' + nombre + '"',
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
