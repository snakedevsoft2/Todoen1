import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { addDays, dayIn, dayRange, inicioDelDiaEn, isValidDay, todayIn } from "@/lib/dates";
import { buildCsv, csvResponse, numero } from "@/lib/csv";
import { tramosDe } from "@/lib/jornada";
import { cubreDia, etiquetaNovedad } from "@/lib/novedades";
import { esRango, limites } from "@/lib/rangos";

/**
 * Las horas trabajadas en Excel (CSV), para la nomina.
 *
 * Una fila por persona y por dia, con la entrada, la salida, las horas en
 * decimal (8,5 y no "8 h 30 min", que Excel no suma) y la novedad aprobada si
 * la hubo; y al final de cada persona, su total. Solo el administrador.
 */
export async function GET(request: Request) {
  const sesion = await getCurrentSession();
  if (!sesion || sesion.staff.role !== "DUENO") return new Response("No autorizado.", { status: 401 });
  const { user } = sesion;

  const url = new URL(request.url);
  const tz = user.timezone;
  const hoy = todayIn(tz);
  const d = url.searchParams.get("d") ?? "";
  const dia = isValidDay(d) ? d : hoy;
  const r = url.searchParams.get("r");
  const { desde, hasta } = limites(dia, esRango(r) ? r : "semana");

  const [personal, marcas, novedades] = await Promise.all([
    db.staff.findMany({
      where: { userId: user.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.attendance.findMany({
      where: {
        userId: user.id,
        voidedAt: null,
        markedAt: { gte: inicioDelDiaEn(desde, tz), lt: inicioDelDiaEn(addDays(hasta, 1), tz) },
      },
      orderBy: { markedAt: "asc" },
      select: { staffId: true, kind: true, markedAt: true, voidedAt: true, site: { select: { name: true } } },
    }),
    db.novelty.findMany({
      where: { userId: user.id, status: "APROBADA", fromDay: { lte: hasta }, toDay: { gte: desde } },
      select: { staffId: true, kind: true, fromDay: true, toDay: true },
    }),
  ]);

  const hora = (x: Date) =>
    x.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
  const horas = (ms: number) => numero(Math.round((ms / 3_600_000) * 100) / 100);

  const filas: unknown[][] = [];
  for (const p of personal) {
    let total = 0;
    let dias = 0;
    for (const dd of dayRange(desde, hasta)) {
      const suyas = marcas.filter((m) => m.staffId === p.id && dayIn(m.markedAt, tz) === dd);
      const novedad = novedades.find((n) => n.staffId === p.id && cubreDia(n, dd));
      if (suyas.length === 0 && !novedad) continue;
      const { totalMs } = tramosDe(suyas, dd === hoy ? new Date() : null);
      if (suyas.length > 0) {
        total += totalMs;
        dias += 1;
      }
      filas.push([
        p.name,
        dd,
        suyas.filter((m) => m.kind === "ENTRADA").map((m) => hora(m.markedAt)).join(" / "),
        suyas.filter((m) => m.kind === "SALIDA").map((m) => hora(m.markedAt)).join(" / "),
        horas(totalMs),
        Array.from(new Set(suyas.map((m) => m.site?.name ?? "Sin sitio"))).join(", "),
        novedad ? etiquetaNovedad(novedad.kind) : "",
      ]);
    }
    if (dias > 0) filas.push([p.name, "TOTAL", "", "", horas(total), dias + (dias === 1 ? " día" : " días"), ""]);
  }

  const csv = buildCsv(["Persona", "Día", "Entrada", "Salida", "Horas", "Sitio", "Novedad"], filas);
  return csvResponse("horas-" + desde + "-a-" + hasta + ".csv", csv);
}
