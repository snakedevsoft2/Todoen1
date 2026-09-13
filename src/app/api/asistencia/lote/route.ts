import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { distanciaM } from "@/lib/geo";
import { motivoParaRechazar } from "@/lib/jornada-reglas";

/**
 * Recibe los marcajes que venian esperando en el telefono.
 *
 * Es un endpoint y no una Server Action a proposito: las acciones viven dentro
 * de una pantalla y aqui hace falta poder mandar desde el trabajador de fondo
 * cuando la senal vuelve, incluso con la pestana cerrada.
 *
 * Acepta un lote y responde por CADA marcaje, porque en un lote pueden venir
 * mezclados los que entran, los que ya habian entrado y los que no se pueden
 * aceptar. El telefono necesita saber cual es cual para limpiar su cola.
 */
export const dynamic = "force-dynamic";

/** Mas de esto en un solo envio es un cliente portandose mal. */
const MAX_LOTE = 200;

/**
 * Cuanto se acepta que el reloj del telefono se adelante.
 *
 * Un marcaje del futuro solo puede venir de un reloj mal puesto o de alguien
 * moviendolo a proposito. Cinco minutos cubre el desfase normal; mas que eso
 * se rechaza, porque una entrada con hora inventada es justo lo que este
 * registro existe para impedir.
 */
const MINUTOS_DE_GRACIA = 5;

/** Tampoco se aceptan marcajes de hace mas de una semana. */
const DIAS_ATRAS = 8;

type Entrada = {
  clientKey?: unknown;
  kind?: unknown;
  markedAt?: unknown;
  siteId?: unknown;
  lat?: unknown;
  lng?: unknown;
  accuracyM?: unknown;
  note?: unknown;
};

type Resultado = {
  clientKey: string;
  estado: "guardado" | "repetido" | "rechazado";
  motivo?: string;
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export async function POST(request: Request) {
  const sesion = await getCurrentSession();
  if (!sesion) return new Response("No autorizado.", { status: 401 });

  const { user, staff } = sesion;

  let cuerpo: { marcajes?: Entrada[] };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const marcajes = Array.isArray(cuerpo.marcajes) ? cuerpo.marcajes : [];
  if (marcajes.length === 0) return Response.json({ resultados: [] });
  if (marcajes.length > MAX_LOTE) {
    return Response.json({ error: "Demasiados marcajes en un envio." }, { status: 413 });
  }

  // Los sitios se leen una vez y no uno por marcaje.
  const sitios = await db.workSite.findMany({
    where: { userId: user.id },
    select: { id: true, lat: true, lng: true },
  });

  const ahora = Date.now();
  const techo = ahora + MINUTOS_DE_GRACIA * 60 * 1000;
  const piso = ahora - DIAS_ATRAS * 24 * 60 * 60 * 1000;

  // En orden de hora: en un lote pueden venir la entrada y la salida del mismo
  // dia, y la regla de la jornada necesita ver primero la entrada.
  const ordenados = [...marcajes].sort((a, b) => String(a.markedAt ?? "").localeCompare(String(b.markedAt ?? "")));

  const resultados: Resultado[] = [];

  for (const m of ordenados) {
    const clientKey = typeof m.clientKey === "string" ? m.clientKey.slice(0, 100) : "";
    if (!clientKey) continue;

    const rechazar = (motivo: string) =>
      resultados.push({ clientKey, estado: "rechazado", motivo });

    // Lo que ya habia entrado se reconoce antes que nada: un reintento no
    // puede terminar rechazado por la regla de "una entrada por dia".
    const yaEntro = await db.attendance.findUnique({ where: { clientKey }, select: { staffId: true } });
    if (yaEntro) {
      if (yaEntro.staffId === staff.id) resultados.push({ clientKey, estado: "repetido" });
      else rechazar("Ese marcaje no se puede recibir.");
      continue;
    }

    if (m.kind !== "ENTRADA" && m.kind !== "SALIDA") {
      rechazar("No dice si es entrada o salida.");
      continue;
    }

    const markedAt = typeof m.markedAt === "string" ? new Date(m.markedAt) : null;
    if (!markedAt || Number.isNaN(markedAt.getTime())) {
      rechazar("La hora del marcaje no es valida.");
      continue;
    }
    if (markedAt.getTime() > techo) {
      rechazar("El reloj del teléfono está adelantado.");
      continue;
    }
    if (markedAt.getTime() < piso) {
      rechazar("El marcaje es demasiado viejo para recibirlo.");
      continue;
    }

    // El sitio tiene que ser de esta cuenta. Sin esto, un id copiado pegaria
    // el marcaje al sitio de otro negocio.
    const siteId = typeof m.siteId === "string" ? m.siteId : null;
    const sitio = siteId ? sitios.find((s) => s.id === siteId) : null;
    if (siteId && !sitio) {
      rechazar("Ese sitio no existe en esta cuenta.");
      continue;
    }

    const motivo = await motivoParaRechazar(staff.id, user.timezone, m.kind, markedAt);
    if (motivo) {
      rechazar(motivo);
      continue;
    }

    const lat = num(m.lat);
    const lng = num(m.lng);
    const distanceM =
      sitio && sitio.lat !== null && sitio.lng !== null && lat !== null && lng !== null
        ? Math.round(distanciaM(lat, lng, sitio.lat, sitio.lng))
        : null;

    try {
      await db.attendance.create({
        data: {
          userId: user.id,
          // Marca siempre la persona de la sesion. El telefono no elige a
          // nombre de quien marca, o cualquiera marcaria por un companero.
          staffId: staff.id,
          siteId: sitio?.id ?? null,
          kind: m.kind,
          markedAt,
          lat,
          lng,
          accuracyM: num(m.accuracyM) !== null ? Math.round(num(m.accuracyM) as number) : null,
          distanceM,
          clientKey,
          note: typeof m.note === "string" ? m.note.slice(0, 200) || null : null,
        },
      });
      resultados.push({ clientKey, estado: "guardado" });
    } catch (error) {
      // La llave unica choca: dos envios del mismo marcaje llegaron a la vez.
      // No es un error, es exactamente lo que la llave existe para resolver.
      const codigo = (error as { code?: string })?.code;
      if (codigo === "P2002") {
        resultados.push({ clientKey, estado: "repetido" });
      } else {
        console.error("No se pudo guardar el marcaje:", error);
        resultados.push({ clientKey, estado: "rechazado", motivo: "No se pudo guardar." });
      }
    }
  }

  return Response.json({ resultados });
}
