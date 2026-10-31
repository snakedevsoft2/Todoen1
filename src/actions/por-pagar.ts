"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { isValidDay, todayIn } from "@/lib/dates";
import { str, texto } from "@/lib/format";
import { RUTA_POR_PAGAR, estadoDe, leerCifra, puedeVerPorPagar, redondear, totalDe } from "@/lib/por-pagar";

// Cuentas por pagar a proveedores (ver lib/por-pagar.ts). Cada accion vuelve a
// mirar quien la pide: esconder el menu no basta, una accion se puede llamar
// igual. Y todo se busca por id Y por negocio, nunca solo por id.
//
// No se anota en la actividad del equipo a proposito: esa la lee el dueño, y
// este apartado es solo de quien lo administra.

export type PorPagarState = { error?: string; ok?: string } | undefined;

const SIN_ACCESO = "Este apartado es solo de la administradora del negocio.";

async function acceso() {
  const sesion = await requireSession();
  return puedeVerPorPagar(sesion.user, sesion.staff) ? sesion : null;
}

function refrescar() {
  revalidatePath(RUTA_POR_PAGAR);
}

// ---------------------------------------------------------------- Proveedores

export async function guardarProveedorAction(_prev: PorPagarState, formData: FormData): Promise<PorPagarState> {
  const sesion = await acceso();
  if (!sesion) return { error: SIN_ACCESO };
  const { user } = sesion;

  const id = str(formData.get("id"));
  const name = str(formData.get("name"), "", 80);
  if (!name) return { error: "Escribe el nombre del proveedor." };
  const datos = {
    name,
    phone: str(formData.get("phone"), "", 40) || null,
    notes: texto(formData.get("notes"), 500) || null,
  };

  if (id) {
    const r = await db.payableSupplier.updateMany({ where: { id, userId: user.id }, data: datos });
    if (r.count === 0) return { error: "No encontramos ese proveedor." };
    refrescar();
    return { ok: "Proveedor guardado." };
  }

  const ultimo = await db.payableSupplier.aggregate({ where: { userId: user.id }, _max: { position: true } });
  await db.payableSupplier.create({
    data: { userId: user.id, ...datos, position: (ultimo._max.position ?? -1) + 1 },
  });
  refrescar();
  return { ok: name + " quedó en la lista." };
}

/** Borra el proveedor con todas sus compras y pagos. */
export async function borrarProveedorAction(formData: FormData) {
  const sesion = await acceso();
  if (!sesion) return;
  await db.payableSupplier.deleteMany({ where: { id: str(formData.get("id")), userId: sesion.user.id } });
  refrescar();
}

// -------------------------------------------------------------------- Compras

export type RenglonPedido = {
  description: string;
  qty: string;
  unitPrice: string;
  discount?: string;
  salePrice?: string;
};

export type CompraPedida = {
  /** Vacio para una compra nueva. */
  id?: string;
  supplierId: string;
  day: string;
  document?: string;
  notes?: string;
  /** El IVA de la factura, en porcentaje. Vacio o "0" si no lo lleva. */
  taxPct?: string;
  /** Solo al crearla: ya se pago entera, queda cancelada. */
  pagada?: boolean;
  items: RenglonPedido[];
};

const TOPE = 1e9;

/** Los renglones como se guardan, o el primer error que tengan. */
function renglonesDe(items: unknown): { ok: true; items: { description: string; qty: number; unitPrice: number; discount: number; salePrice: number | null }[] } | { ok: false; error: string } {
  if (!Array.isArray(items)) return { ok: false, error: "La compra no trae renglones." };
  const lista = (items as Partial<RenglonPedido>[]).filter((r) => String(r?.description ?? "").trim());
  if (lista.length === 0) return { ok: false, error: "Escribe al menos un producto." };
  if (lista.length > 200) return { ok: false, error: "Son demasiados renglones para una sola compra." };

  const salida = [];
  for (const [n, r] of lista.entries()) {
    const fila = "Renglón " + (n + 1) + ": ";
    const description = String(r.description).replace(/\s+/g, " ").trim().slice(0, 120);
    const qty = leerCifra(r.qty);
    const unitPrice = r.unitPrice?.trim() ? leerCifra(r.unitPrice) : 0;
    const discount = r.discount?.trim() ? leerCifra(r.discount) : 0;
    const salePrice = r.salePrice?.trim() ? leerCifra(r.salePrice) : null;
    if (!(qty > 0 && qty < TOPE)) return { ok: false, error: fila + "la cantidad debe ser mayor a cero." };
    if (!(unitPrice >= 0 && unitPrice < TOPE)) return { ok: false, error: fila + "revisa el precio." };
    if (!(discount >= 0 && discount < TOPE)) return { ok: false, error: fila + "revisa el descuento." };
    if (salePrice !== null && !(salePrice >= 0 && salePrice < TOPE)) {
      return { ok: false, error: fila + "revisa el precio de venta." };
    }
    salida.push({
      description,
      qty: redondear(qty),
      unitPrice: redondear(unitPrice),
      discount: redondear(discount),
      salePrice: salePrice === null ? null : redondear(salePrice),
    });
  }
  return { ok: true, items: salida };
}

export async function guardarCompraAction(pedido: CompraPedida): Promise<PorPagarState> {
  const sesion = await acceso();
  if (!sesion) return { error: SIN_ACCESO };
  const { user } = sesion;

  const proveedor = await db.payableSupplier.findFirst({
    where: { id: String(pedido?.supplierId ?? ""), userId: user.id },
    select: { id: true, name: true },
  });
  if (!proveedor) return { error: "No encontramos ese proveedor." };

  const day = isValidDay(String(pedido.day ?? "")) ? pedido.day : todayIn(user.timezone);
  const r = renglonesDe(pedido.items);
  if (!r.ok) return { error: r.error };
  const iva = String(pedido.taxPct ?? "").trim() ? leerCifra(pedido.taxPct) : 0;
  if (!(iva >= 0 && iva <= 100)) return { error: "Revisa el porcentaje de IVA." };
  const filas = (billId: string) =>
    r.items.map((i, position) => ({ userId: user.id, billId, position, ...i }));
  const datos = {
    day,
    document: String(pedido.document ?? "").trim().slice(0, 60) || null,
    notes: String(pedido.notes ?? "").trim().slice(0, 500) || null,
    taxPct: Math.round(iva * 100) / 100,
  };

  if (pedido.id) {
    const compra = await db.payableBill.findFirst({ where: { id: String(pedido.id), userId: user.id }, select: { id: true } });
    if (!compra) return { error: "No encontramos esa compra." };
    await db.$transaction([
      db.payableItem.deleteMany({ where: { billId: compra.id, userId: user.id } }),
      db.payableItem.createMany({ data: filas(compra.id) }),
      db.payableBill.update({ where: { id: compra.id }, data: datos }),
    ]);
    refrescar();
    return { ok: "Compra corregida." };
  }

  await db.$transaction(async (tx) => {
    const compra = await tx.payableBill.create({ data: { userId: user.id, supplierId: proveedor.id, ...datos } });
    await tx.payableItem.createMany({ data: filas(compra.id) });
    if (pedido.pagada) {
      await tx.payablePayment.create({
        data: { userId: user.id, billId: compra.id, amount: totalDe(r.items, datos.taxPct), day, notes: "Pagada al anotarla" },
      });
    }
  });
  refrescar();
  return { ok: "Compra a " + proveedor.name + " anotada." };
}

export async function borrarCompraAction(formData: FormData) {
  const sesion = await acceso();
  if (!sesion) return;
  await db.payableBill.deleteMany({ where: { id: str(formData.get("id")), userId: sesion.user.id } });
  refrescar();
}

// ---------------------------------------------------------------------- Pagos

/** Un pago a una compra: todo lo que falta o un abono. */
export async function pagarCompraAction(_prev: PorPagarState, formData: FormData): Promise<PorPagarState> {
  const sesion = await acceso();
  if (!sesion) return { error: SIN_ACCESO };
  const { user } = sesion;

  const compra = await db.payableBill.findFirst({
    where: { id: str(formData.get("billId")), userId: user.id },
    include: { items: true, payments: { select: { amount: true } } },
  });
  if (!compra) return { error: "No encontramos esa compra." };

  const total = totalDe(
    compra.items.map((i) => ({
      qty: Number(i.qty),
      unitPrice: Number(i.unitPrice),
      discount: Number(i.discount),
      salePrice: i.salePrice === null ? null : Number(i.salePrice),
    })),
    Number(compra.taxPct)
  );
  const pagado = compra.payments.reduce((s, p) => s + Number(p.amount), 0);
  const falta = redondear(total - pagado);
  if (estadoDe(total, pagado) === "CANCELADO") return { error: "Esa compra ya está pagada." };

  const amount = redondear(leerCifra(String(formData.get("amount") ?? "")));
  if (!(amount > 0)) return { error: "Escribe cuánto pagaste." };
  if (amount > falta + 0.004) return { error: "Es más de lo que falta por pagar." };

  const dia = str(formData.get("day"));
  await db.payablePayment.create({
    data: {
      userId: user.id,
      billId: compra.id,
      amount,
      day: isValidDay(dia) ? dia : todayIn(user.timezone),
      notes: texto(formData.get("notes"), 200) || null,
    },
  });
  refrescar();
  return { ok: amount >= falta - 0.004 ? "Compra pagada por completo." : "Abono anotado." };
}

export async function borrarPagoAction(formData: FormData) {
  const sesion = await acceso();
  if (!sesion) return;
  await db.payablePayment.deleteMany({ where: { id: str(formData.get("id")), userId: sesion.user.id } });
  refrescar();
}
