import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { puedeVerSolicitud } from "@/lib/firmas";
import { respuestaPdf } from "@/lib/firma-respuesta";

/**
 * Abre un documento de una solicitud de firma desde el panel. Con ?firmado=1
 * entrega el firmado. Lo ve el administrador o quien creo la solicitud.
 */
export async function GET(request: Request, { params }: { params: Promise<{ docId: string }> }) {
  const sesion = await getCurrentSession();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  const { docId } = await params;
  const url = new URL(request.url);
  const firmado = url.searchParams.get("firmado") === "1";
  const doc = await db.signDocument.findFirst({
    where: { id: docId, userId: sesion.user.id },
    select: { name: true, pdf: !firmado, signedPdf: firmado, request: { select: { createdByStaffId: true } } },
  });
  if (!doc || !puedeVerSolicitud(sesion.staff, doc.request)) return new NextResponse("Sin archivo", { status: 404 });

  const pdf = firmado ? doc.signedPdf : doc.pdf;
  if (!pdf) return new NextResponse("Sin archivo", { status: 404 });
  return respuestaPdf(pdf, doc.name + (firmado ? " (firmado)" : ""), url.searchParams.get("descargar") === "1");
}
