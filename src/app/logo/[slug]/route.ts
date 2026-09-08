import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Sirve el logo del negocio como imagen.
 *
 * Lo guardamos en la base de datos como data URL, pero si lo incrustaramos en
 * cada pagina el HTML pesaria de mas. Aqui lo devolvemos una sola vez y el
 * navegador lo guarda en cache.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const shop = await db.user.findUnique({
    where: { slug },
    select: { logo: true },
  });

  if (!shop?.logo) return new NextResponse("Sin logo", { status: 404 });

  const match = /^data:([^;]+);base64,(.+)$/.exec(shop.logo);
  if (!match) return new NextResponse("Logo invalido", { status: 404 });

  const [, mime, base64] = match;
  const bytes = Buffer.from(base64, "base64");

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.length),
      // La direccion lleva la version del logo, asi que se puede cachear fuerte.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
