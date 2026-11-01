import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * El XML autorizado por el SRI de una factura emitida directo: el que se le
 * entrega al comprador junto con el PDF. Solo de este negocio.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession();
  const { id } = await params;
  const f = await db.electronicInvoice.findFirst({
    where: { id, userId: user.id, provider: "sri", status: "AUTORIZADA" },
    select: { xml: true, number: true },
  });
  if (!f?.xml) return new Response("No encontrado", { status: 404 });
  return new Response(f.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="factura-' + (f.number ?? id) + '.xml"',
      "Cache-Control": "private, no-store",
    },
  });
}
