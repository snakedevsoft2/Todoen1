import { firmarSolicitud } from "@/lib/firmas";

/**
 * El cliente firma desde su enlace. Sin sesion: lo protege el token. Se
 * guarda desde donde firmo (IP y navegador) para la constancia.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (Number(request.headers.get("content-length") ?? 0) > 1_000_000) {
    return Response.json({ error: "La firma pesa demasiado." }, { status: 413 });
  }
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const { token } = await params;
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip");
  const r = await firmarSolicitud(String(token ?? "").slice(0, 60), cuerpo ?? {}, {
    ip: ip || null,
    navegador: request.headers.get("user-agent"),
  });
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ ok: true });
}
