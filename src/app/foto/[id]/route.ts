import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { servirImagen } from "@/lib/imagen-servida";

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

  if (!service) return new NextResponse("Sin foto", { status: 404 });

  return servirImagen(service.image);
}
