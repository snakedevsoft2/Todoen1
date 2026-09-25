import type { Prisma } from "@prisma/client";

/**
 * El numero de recibo, uno solo por negocio y compartido entre ventas, abonos
 * y prestamos: al dueño le sube 1, 2, 3... sin importar cual de los tres lo
 * genero. Antes cada recibo mostraba los ultimos 8 caracteres del id (algo
 * como "8VKJDB84"), que no sirve para lo que un tendero de verdad necesita:
 * saber cual recibo va antes que cual.
 *
 * Hay que llamarla dentro de la misma transaccion que crea la venta, el abono
 * o el prestamo: asi dos recibos al mismo tiempo nunca se quedan con el mismo
 * numero.
 */
export async function nextReceiptSeq(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const actualizado = await tx.user.update({
    where: { id: userId },
    data: { nextReceiptSeq: { increment: 1 } },
    select: { nextReceiptSeq: true },
  });
  return actualizado.nextReceiptSeq - 1;
}

/** Como se muestra en el papel: con ceros adelante, igual que una factura de verdad. */
export function formatReceiptSeq(seq: number): string {
  return String(seq).padStart(4, "0");
}
