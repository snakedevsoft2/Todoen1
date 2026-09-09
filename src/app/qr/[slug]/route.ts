import { db } from "@/lib/db";
import { qrSvg } from "@/lib/qr";

/**
 * QR del portafolio del negocio, como SVG listo para imprimir.
 *
 * Apunta al enlace publico del negocio. Es publico a proposito: el QR se pega
 * en la vitrina, no tiene nada privado adentro.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const shop = await db.user.findUnique({ where: { slug }, select: { id: true } });
  if (!shop) return new Response("No encontramos ese negocio.", { status: 404 });

  const url = new URL(request.url);
  const destino = url.origin + "/catalogo/" + slug;
  const descargar = url.searchParams.get("descargar") === "1";

  const svg = qrSvg(destino, { size: 640 });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      ...(descargar
        ? { "Content-Disposition": 'attachment; filename="qr-' + slug + '.svg"' }
        : {}),
    },
  });
}
