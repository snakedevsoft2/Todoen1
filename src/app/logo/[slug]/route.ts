import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { servirImagen } from "@/lib/imagen-servida";

/**
 * Sirve el logo del negocio como imagen.
 *
 * Lo guardamos en la base de datos como data URL, pero si lo incrustaramos en
 * cada pagina el HTML pesaria de mas. Aqui lo devolvemos una sola vez y el
 * navegador lo guarda en cache.
 *
 * De que solo salga una imagen de verdad, y nunca algo que pueda ejecutarse,
 * se encarga servirImagen: ahi esta explicado por que hace falta.
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

  if (!shop) return new NextResponse("Sin logo", { status: 404 });

  return servirImagen(shop.logo);
}
