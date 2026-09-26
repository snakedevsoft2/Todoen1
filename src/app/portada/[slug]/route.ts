import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { servirImagen } from "@/lib/imagen-servida";

/**
 * Sirve la foto de portada del portafolio publico.
 *
 * Igual que el logo y las fotos de producto. Esta era la ultima que seguia
 * yendo incrustada dentro del HTML: la portada es la imagen mas grande de
 * todas (va de lado a lado de la pantalla), asi que el catalogo publico
 * -justo la pagina que el negocio reparte por WhatsApp y por QR- se llevaba
 * ese peso entero en cada visita, sin que el navegador pudiera guardarla.
 * Aqui sale una sola vez y queda cacheada por la version de la direccion.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const shop = await db.user.findUnique({
    where: { slug },
    select: { publicCover: true },
  });

  if (!shop) return new NextResponse("Sin portada", { status: 404 });

  return servirImagen(shop.publicCover);
}
