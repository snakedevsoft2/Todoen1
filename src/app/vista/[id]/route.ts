import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { servirImagen } from "@/lib/imagen-servida";

/** Sirve una vista 360 como imagen. El id es un cuid imposible de adivinar. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vista = await db.productView.findUnique({ where: { id }, select: { image: true } });
  if (!vista) return new NextResponse("Sin imagen", { status: 404 });
  return servirImagen(vista.image);
}
