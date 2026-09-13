import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { servirImagen } from "@/lib/imagen-servida";

/**
 * El soporte de una novedad: la foto de la incapacidad, de la cita medica.
 * Es informacion personal: la ven el administrador y la persona que la subio.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getCurrentSession();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  const { id } = await params;
  const novedad = await db.novelty.findFirst({
    where: { id, userId: sesion.user.id },
    select: { photo: true, staffId: true },
  });
  const puede = sesion.staff.role === "DUENO" || novedad?.staffId === sesion.staff.id;
  if (!novedad?.photo || !puede) return new NextResponse("Sin foto", { status: 404 });

  const respuesta = servirImagen(novedad.photo);
  respuesta.headers.set("Cache-Control", "private, max-age=3600");
  return respuesta;
}
