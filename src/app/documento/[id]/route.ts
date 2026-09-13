import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { puedeVerDocumento } from "@/lib/documentos";

/**
 * Abre un documento escaneado. Lo ve el administrador o quien lo escaneo; un
 * id ajeno responde 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getCurrentSession();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  const { id } = await params;
  const doc = await db.scanDocument.findFirst({
    where: { id, userId: sesion.user.id },
    select: { title: true, pdf: true, staffId: true },
  });
  if (!doc || !puedeVerDocumento(sesion.staff, doc)) return new NextResponse("Sin archivo", { status: 404 });

  const bytes = Buffer.from(doc.pdf.slice(doc.pdf.indexOf(",") + 1), "base64");
  const nombre = (doc.title.replace(/[^\w.\- ]+/g, "_") || "documento") + ".pdf";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="' + nombre + '"',
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
