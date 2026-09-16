import { db } from "@/lib/db";
import { qrSvg } from "@/lib/qr";

/**
 * QR de una mesa, como SVG listo para imprimir y pegar en la mesa.
 *
 * Apunta a la pagina publica donde el cliente pide desde su celular. Publico
 * a proposito, igual que el del portafolio: no lleva nada privado, solo el
 * token de la mesa.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const mesa = await db.table.findUnique({ where: { qrToken: token }, select: { active: true } });
  if (!mesa || !mesa.active) return new Response("No encontramos esa mesa.", { status: 404 });

  const url = new URL(request.url);
  const destino = url.origin + "/mesa/" + token;
  const descargar = url.searchParams.get("descargar") === "1";

  const svg = qrSvg(destino, { size: 640 });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      ...(descargar ? { "Content-Disposition": 'attachment; filename="qr-mesa.svg"' } : {}),
    },
  });
}
