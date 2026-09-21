import { getCurrentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiEnabled } from "@/lib/ai";
import { esAngulo, generarVista } from "@/lib/vistas360";

/**
 * Vistas 360 de un producto, generadas con IA desde su foto.
 *
 * POST hace UNA vista por llamada (el panel pide las tres una tras otra): asi
 * cada peticion cabe en el tiempo del servidor. Solo el dueño, y solo sobre
 * productos de su propio negocio.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function productoDelDueno(id: string) {
  const sesion = await getCurrentSession();
  if (!sesion) return { error: Response.json({ error: "Tu sesión se cerró. Vuelve a entrar." }, { status: 401 }) };
  if (sesion.staff.role !== "DUENO") {
    return { error: Response.json({ error: "Solo el dueño puede hacer esto." }, { status: 403 }) };
  }
  const service = await db.service.findFirst({
    where: { id, userId: sesion.user.id },
    select: { id: true, name: true, image: true },
  });
  if (!service) return { error: Response.json({ error: "No encontramos ese producto." }, { status: 404 }) };
  return { sesion, service };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await productoDelDueno(id);
  if (r.error) return r.error;
  if (!aiEnabled()) return Response.json({ error: "Falta la clave de la IA en el servidor." }, { status: 400 });
  if (!r.service.image) return Response.json({ error: "Primero sube la foto del producto." }, { status: 400 });

  const cuerpo = (await request.json().catch(() => ({}))) as { angulo?: unknown };
  if (!esAngulo(cuerpo.angulo)) return Response.json({ error: "Ángulo inválido." }, { status: 400 });

  const vista = await generarVista(r.service.image, cuerpo.angulo, r.service.name);
  if (!vista.ok) return Response.json({ error: vista.error }, { status: 502 });

  await db.productView.upsert({
    where: { serviceId_angle: { serviceId: r.service.id, angle: cuerpo.angulo } },
    create: { userId: r.sesion.user.id, serviceId: r.service.id, angle: cuerpo.angulo, image: vista.dataUrl },
    update: { image: vista.dataUrl, createdAt: new Date() },
  });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await productoDelDueno(id);
  if (r.error) return r.error;
  await db.productView.deleteMany({ where: { serviceId: r.service.id, userId: r.sesion.user.id } });
  return Response.json({ ok: true });
}
