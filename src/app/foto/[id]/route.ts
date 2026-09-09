import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Sirve la foto de una prenda como imagen.
 *
 * Misma idea que el logo: la guardamos como data URL en la base de datos, pero
 * si la incrustaramos en cada tarjeta del catalogo el HTML pesaria muchisimo.
 * Aqui sale una sola vez y el navegador la cachea.
 *
 * La direccion lleva el id del producto, que es un cuid imposible de adivinar,
 * y la foto es justamente lo que el negocio quiere mostrar en publico.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const service = await db.service.findUnique({
    where: { id },
    select: { image: true },
  });

  if (!service?.image) return new NextResponse("Sin foto", { status: 404 });

  const match = /^data:([^;]+);base64,(.+)$/.exec(service.image);
  if (!match) return new NextResponse("Foto invalida", { status: 404 });

  const [, mime, base64] = match;
  const bytes = Buffer.from(base64, "base64");

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.length),
      // La direccion lleva la version, asi que se puede cachear fuerte.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
