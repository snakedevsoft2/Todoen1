import type { Prisma } from "@prisma/client";

/**
 * Tarjeta de fidelizacion del lavadero: un sello por lavado cobrado, hasta
 * completar la meta del negocio (User.loyaltyGoal). Al completarla, se
 * resetea y se anota que gano un premio (User.loyaltyReward), que se entrega
 * a mano.
 *
 * Vive aparte de lib/lavadero.ts porque la fidelizacion es un cliente que
 * puede volver por cualquier lavado, no una propiedad del vehiculo o del
 * turno de ese dia.
 */

export type ResultadoSello = {
  stamps: number;
  goal: number;
  faltan: number;
  alcanzoMeta: boolean;
};

/** Se llama dentro de la misma transaccion que crea la Sale del lavado. */
export async function registrarSello(
  tx: Prisma.TransactionClient,
  datos: { userId: string; customerId: string | null; saleId: string; goal: number }
): Promise<ResultadoSello | null> {
  if (!datos.customerId) return null;

  const tarjeta = await tx.loyaltyCard.upsert({
    where: { customerId: datos.customerId },
    create: { userId: datos.userId, customerId: datos.customerId, stamps: 0 },
    update: {},
  });
  await tx.loyaltyStamp.create({
    data: { userId: datos.userId, loyaltyCardId: tarjeta.id, saleId: datos.saleId },
  });

  const stamps = tarjeta.stamps + 1;
  const alcanzoMeta = stamps >= datos.goal;
  await tx.loyaltyCard.update({
    where: { id: tarjeta.id },
    data: alcanzoMeta
      ? { stamps: 0, rewardsEarned: { increment: 1 }, lastStampAt: new Date() }
      : { stamps, lastStampAt: new Date() },
  });

  return {
    stamps: alcanzoMeta ? 0 : stamps,
    goal: datos.goal,
    faltan: Math.max(0, datos.goal - stamps),
    alcanzoMeta,
  };
}

/** Para avisarle al jefe de patio, al recibir el vehiculo, que este cliente esta cerca del premio. */
export async function avisoDeCercania(
  db: Prisma.TransactionClient,
  customerId: string | null,
  goal: number
): Promise<{ stamps: number; faltan: number } | null> {
  if (!customerId) return null;
  const tarjeta = await db.loyaltyCard.findUnique({ where: { customerId } });
  if (!tarjeta) return null;
  const faltan = goal - tarjeta.stamps;
  if (faltan > 2 || faltan <= 0) return null;
  return { stamps: tarjeta.stamps, faltan };
}
