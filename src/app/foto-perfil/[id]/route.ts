import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { servirImagen } from "@/lib/imagen-servida";

/**
 * La foto de perfil de alguien del equipo.
 *
 * Solo la ve gente del mismo negocio: es la cara de un empleado, no algo para
 * mostrar en internet. La direccion lleva la version (?v=), asi que se puede
 * guardar un dia en el navegador sin quedarse con una foto vieja.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getCurrentSession();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  const { id } = await params;
  const persona = await db.staff.findFirst({
    where: { id, userId: sesion.user.id },
    select: { photo: true },
  });
  if (!persona?.photo) return new NextResponse("Sin foto", { status: 404 });

  const respuesta = servirImagen(persona.photo);
  respuesta.headers.set("Cache-Control", "private, max-age=86400");
  return respuesta;
}
