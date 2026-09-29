import { db } from "./db";
import { addDays, dayIn, inicioDelDiaEn } from "./dates";
import { avisarAPersona } from "./push";
import { recibeRecordatorioDeMarcar } from "./push-textos";

/**
 * Recordatorio al celular para marcar, a cada empleado (jefe de patio
 * incluido) que activo las notificaciones. El dueño no ficha, asi que a el no.
 *
 *   - "entrada": a quien hoy todavia no ha marcado entrada.
 *   - "salida": a quien tiene una entrada sin salida. En el lavadero se le
 *     dice ademas que a medianoche se marca sola (ver salida-automatica.ts).
 *
 * Lo llama el cron dos veces al dia (ver vercel.json). Solo se le escribe a
 * quien tiene suscripcion: los demas no cuestan ni una consulta de mas.
 */
const VENTANA_MS = 20 * 60 * 60 * 1000;

export async function recordarMarcar(tipo: "entrada" | "salida", ahora = new Date()) {
  const subs = await db.pushSubscription.findMany({
    where: { staff: { active: true, role: { not: "DUENO" } } },
    select: {
      staffId: true,
      staff: { select: { name: true } },
      user: { select: { id: true, timezone: true, businessType: true } },
    },
    distinct: ["staffId"],
  });

  let enviados = 0;
  for (const s of subs) {
    if (!recibeRecordatorioDeMarcar(s.user.businessType)) continue;

    const ultimo = await db.attendance.findFirst({
      where: { staffId: s.staffId, voidedAt: null, markedAt: { gte: new Date(ahora.getTime() - VENTANA_MS), lte: ahora } },
      orderBy: { markedAt: "desc" },
      select: { kind: true },
    });
    const adentro = ultimo?.kind === "ENTRADA";

    if (tipo === "salida") {
      if (!adentro) continue;
      enviados += await avisarAPersona(s.user.id, s.staffId, {
        title: "No olvides marcar tu salida",
        body:
          s.user.businessType === "LAVADERO"
            ? "Márcala antes de irte. Si no, a medianoche se marca sola y le queda al dueño que no la marcaste."
            : "Márcala antes de irte.",
        url: "/panel/marcar",
        tag: "recordar-marcar",
      });
      continue;
    }

    if (adentro) continue;
    const hoy = dayIn(ahora, s.user.timezone);
    const yaEntro = await db.attendance.count({
      where: {
        staffId: s.staffId,
        voidedAt: null,
        kind: "ENTRADA",
        markedAt: { gte: inicioDelDiaEn(hoy, s.user.timezone), lt: inicioDelDiaEn(addDays(hoy, 1), s.user.timezone) },
      },
    });
    if (yaEntro > 0) continue;
    enviados += await avisarAPersona(s.user.id, s.staffId, {
      title: "Buenos días, " + s.staff.name.split(" ")[0],
      body: "Recuerda marcar tu entrada cuando llegues.",
      url: "/panel/marcar",
      tag: "recordar-marcar",
    });
  }
  return enviados;
}
