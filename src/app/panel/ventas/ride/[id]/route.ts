import { requireSession } from "@/lib/auth";
import { archivosDeFactura } from "@/lib/facturacion";

export const dynamic = "force-dynamic";

/**
 * El RIDE (la factura en PDF) de una factura autorizada directo con el SRI,
 * armado desde el XML autorizado. Es el mismo que le llega al comprador por
 * correo. Solo de este negocio.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession();
  const { id } = await params;
  const archivos = await archivosDeFactura(id, user.id);
  if (!archivos) return new Response("No encontrado", { status: 404 });
  return new Response(archivos.pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="' + archivos.nombrePdf + '"',
      "Cache-Control": "private, no-store",
    },
  });
}
