import type { PrismaClient } from "@prisma/client";
import { normalizar } from "./orden-productos";
import { totalDe } from "./por-pagar";
import type { LibroPorPagar } from "./por-pagar-excel";

/**
 * Importa el Excel de proveedores (ya leido, ver lib/por-pagar-excel.ts) a
 * Cuentas por pagar. Sin `aplicar` es un ensayo. Se puede correr dos veces:
 * el proveedor se busca por nombre y cada compra lleva en su nota de que hoja
 * y fila salio, asi que la que ya estaba se salta. Todo o nada.
 */
export type ReportePorPagar = {
  aplicado: boolean;
  proveedores: { nombre: string; nuevo: boolean; compras: number; nuevas: number; total: number; pendiente: number }[];
  avisos: string[];
};

/** "(IMDAKA, fila 10)": de donde salio la compra. Va en su nota. */
const origen = (ref: string) => {
  const [hoja, fila] = ref.split("!");
  return "Del Excel (" + hoja + ", fila " + fila + ")";
};

export async function importarPorPagar(
  db: PrismaClient,
  args: { userId: string; libro: LibroPorPagar; aplicar: boolean }
): Promise<ReportePorPagar> {
  const { userId, libro, aplicar } = args;
  const existentes = await db.payableSupplier.findMany({
    where: { userId },
    select: { id: true, name: true, position: true, bills: { select: { notes: true } } },
  });
  const porNombre = new Map(existentes.map((p) => [normalizar(p.name), p]));

  const reporte: ReportePorPagar = { aplicado: false, proveedores: [], avisos: [...libro.avisos] };
  const plan = libro.proveedores.map((p) => {
    const ya = porNombre.get(normalizar(p.nombre));
    const notasYa = new Set((ya?.bills ?? []).map((b) => b.notes ?? ""));
    const nuevas = p.compras.filter((c) => ![...notasYa].some((n) => n.includes(origen(c.ref))));
    const total = p.compras.reduce((s, c) => s + totalDe(c.items, c.taxPct), 0);
    const pendiente = p.compras.filter((c) => !c.pagada).reduce((s, c) => s + totalDe(c.items, c.taxPct), 0);
    reporte.proveedores.push({ nombre: p.nombre, nuevo: !ya, compras: p.compras.length, nuevas: nuevas.length, total, pendiente });
    return { p, ya, nuevas };
  });

  if (!aplicar) return reporte;

  await db.$transaction(
    async (tx) => {
      let lugar = Math.max(-1, ...existentes.map((p) => p.position));
      for (const { p, ya, nuevas } of plan) {
        const proveedor =
          ya ?? (await tx.payableSupplier.create({ data: { userId, name: p.nombre, notes: p.notas, position: ++lugar } }));
        for (const c of nuevas) {
          const compra = await tx.payableBill.create({
            data: {
              userId,
              supplierId: proveedor.id,
              day: c.day,
              document: c.document,
              taxPct: c.taxPct,
              notes: [c.notes, origen(c.ref)].filter(Boolean).join(". "),
            },
          });
          await tx.payableItem.createMany({
            data: c.items.map((i, position) => ({
              userId,
              billId: compra.id,
              position,
              description: i.description,
              qty: i.qty,
              unitPrice: i.unitPrice,
              discount: i.discount,
              salePrice: i.salePrice,
            })),
          });
          if (c.pagada) {
            await tx.payablePayment.create({
              data: { userId, billId: compra.id, amount: totalDe(c.items, c.taxPct), day: c.day, notes: "CANCELADO en el Excel" },
            });
          }
        }
      }
    },
    { timeout: 60_000, maxWait: 20_000 }
  );
  reporte.aplicado = true;
  return reporte;
}
