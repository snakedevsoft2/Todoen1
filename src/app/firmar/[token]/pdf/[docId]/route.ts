import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { solicitudPorToken } from "@/lib/firmas";
import { respuestaPdf } from "@/lib/firma-respuesta";

/**
 * El PDF que ve el cliente desde su enlace. Sin sesion: lo protege el token,
 * y el documento tiene que ser de esa solicitud. Con ?firmado=1, la copia
 * firmada.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const sol = await solicitudPorToken(String(token ?? "").slice(0, 60));
  if (!sol || sol.status === "ANULADO") return new NextResponse("Sin archivo", { status: 404 });

  const url = new URL(request.url);
  const firmado = url.searchParams.get("firmado") === "1";
  const doc = await db.signDocument.findFirst({
    where: { id: docId, requestId: sol.id },
    select: { name: true, pdf: !firmado, signedPdf: firmado },
  });
  const pdf = firmado ? doc?.signedPdf : doc?.pdf;
  if (!doc || !pdf) return new NextResponse("Sin archivo", { status: 404 });
  return respuestaPdf(pdf, doc.name + (firmado ? " (firmado)" : ""), url.searchParams.get("descargar") === "1");
}
