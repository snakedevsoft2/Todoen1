import { getCurrentSession } from "@/lib/auth";

/**
 * Recibe los errores que se cayeron en el telefono de alguien (ver
 * lib/error-cliente.ts) y los deja en los registros del servidor. No guarda
 * nada en la base: es para poder saber que paso cuando alguien manda la foto
 * de una pantalla de error.
 */
export const dynamic = "force-dynamic";

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 8_000) return new Response(null, { status: 413 });
  let d: Record<string, unknown>;
  try {
    d = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  // Quien era, si tenia sesion: sin esto no se sabe de que negocio es el error.
  const sesion = await getCurrentSession().catch(() => null);
  console.error(
    "[error-cliente]",
    JSON.stringify({
      negocio: sesion?.user.businessName ?? null,
      cuenta: sesion?.user.id ?? null,
      persona: sesion?.staff.id ?? null,
      rol: sesion?.staff.role ?? null,
      donde: texto(d.donde, 40),
      nombre: texto(d.nombre, 80),
      mensaje: texto(d.mensaje, 500),
      digest: texto(d.digest, 80),
      ruta: texto(d.ruta, 200),
      instalada: d.instalada === true,
      enLinea: d.enLinea === true,
      navegador: (request.headers.get("user-agent") ?? "").slice(0, 300),
      pila: texto(d.pila, 1500),
    })
  );
  return new Response(null, { status: 204 });
}
