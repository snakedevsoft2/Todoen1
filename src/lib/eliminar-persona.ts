import { db } from "./db";
import { datosDeExColaborador } from "./staff";

/**
 * Elimina a una persona del equipo sin tocar lo que hizo (ver
 * deleteStaffAction). Devuelve como se llamaba, para la auditoria, o null si
 * no es de este negocio, es el dueño o ya se habia eliminado.
 */
export async function eliminarPersona(userId: string, staffId: string): Promise<{ name: string } | null> {
  const persona = await db.staff.findFirst({ where: { id: staffId, userId, deletedAt: null } });
  if (!persona || persona.role === "DUENO") return null;

  await db.$transaction([
    db.staff.update({ where: { id: persona.id }, data: datosDeExColaborador() }),
    // Nada que le siga llegando ni le sirva para volver a entrar.
    db.pushSubscription.deleteMany({ where: { staffId: persona.id } }),
    db.passwordReset.deleteMany({ where: { staffId: persona.id } }),
  ]);
  return { name: persona.name };
}
