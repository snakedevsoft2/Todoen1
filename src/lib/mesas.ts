import { db } from "./db";
import { todayIn } from "./dates";

/**
 * Las mesas del restaurante, cada una con su propio codigo QR para pedir.
 *
 * La mesa es un mueble: existe siempre, tenga o no una cuenta abierta ahora
 * mismo. Cuando alguien pide (a mano, en el panel, o por el QR desde su
 * celular) se le abre o se le sigue cargando la cuenta (Order) de esa mesa.
 *
 * Archivo del servidor: aqui vive la unica logica de negocio, para que el
 * panel del dueño y la pagina publica del QR hagan siempre lo mismo.
 */

export const MAX_MESAS = 60;

export type Resultado = { ok: string } | { error: string };

export async function mesasDelNegocio(userId: string) {
  return db.table.findMany({ where: { userId, active: true }, orderBy: { number: "asc" } });
}

/** Cuantas mesas activas tiene ahora mismo. */
export async function totalMesas(userId: string): Promise<number> {
  return db.table.count({ where: { userId, active: true } });
}

/**
 * Deja exactamente `cantidad` mesas activas.
 *
 * Nunca se borra una mesa (puede tener cuentas de antes en su historial): al
 * bajar la cantidad se apagan las de numero mas alto, y al subirla se
 * reactivan primero las que ya existian antes de crear unas nuevas. Asi el
 * numero de una mesa y su codigo QR no cambian nunca por accidente.
 */
export async function configurarMesas(userId: string, cantidad: number): Promise<Resultado> {
  if (!Number.isInteger(cantidad) || cantidad < 0) return { error: "Escribe cuántas mesas tienes." };
  if (cantidad > MAX_MESAS) return { error: "Como mucho " + MAX_MESAS + " mesas." };

  const existentes = await db.table.findMany({ where: { userId }, orderBy: { number: "asc" } });
  const activas = existentes.filter((t) => t.active);
  if (cantidad === activas.length) return { ok: "Sin cambios: ya tenías " + cantidad + "." };

  if (cantidad > activas.length) {
    let faltan = cantidad - activas.length;
    const inactivas = existentes.filter((t) => !t.active).sort((a, b) => a.number - b.number);
    const reactivar = inactivas.slice(0, faltan);
    if (reactivar.length > 0) {
      await db.table.updateMany({ where: { id: { in: reactivar.map((t) => t.id) } }, data: { active: true } });
      faltan -= reactivar.length;
    }
    if (faltan > 0) {
      const maxNumero = existentes.reduce((m, t) => Math.max(m, t.number), 0);
      await db.table.createMany({
        data: Array.from({ length: faltan }, (_, i) => ({ userId, number: maxNumero + i + 1 })),
      });
    }
  } else {
    const sobran = [...activas].sort((a, b) => b.number - a.number).slice(0, activas.length - cantidad);
    await db.table.updateMany({ where: { id: { in: sobran.map((t) => t.id) } }, data: { active: false } });
  }

  return { ok: "Ahora tienes " + cantidad + (cantidad === 1 ? " mesa." : " mesas.") };
}

export type ItemPedido = { serviceId: string; qty: number };

/** Cuanto puede pedir de una vez el cliente, para que un mal uso no llene la cuenta de mentiras. */
const MAX_ITEMS_POR_PEDIDO = 40;
const MAX_QTY_POR_ITEM = 30;

/**
 * El cliente pide desde el QR de su mesa, sin sesion.
 *
 * Si la mesa ya tiene una cuenta abierta, se le suma a esa (junta cantidades
 * del mismo producto); si no, se abre una. Queda marcada "hasNewFromCustomer"
 * para que el mesero la vea resaltada sin tener que estar pendiente.
 */
export async function pedirEnMesa(
  qrToken: string,
  itemsCrudo: ItemPedido[],
  nota: string | null
): Promise<Resultado & { orderId?: string }> {
  const mesa = await db.table.findUnique({
    where: { qrToken },
    select: { id: true, userId: true, number: true, active: true },
  });
  if (!mesa || !mesa.active) return { error: "Esa mesa ya no existe. Avísale a alguien del negocio." };

  const items = itemsCrudo.slice(0, MAX_ITEMS_POR_PEDIDO).filter((i) => i.serviceId);
  if (items.length === 0) return { error: "Elige al menos un producto." };

  const servicios = await db.service.findMany({
    where: { userId: mesa.userId, id: { in: items.map((i) => i.serviceId) }, active: true },
    select: { id: true, name: true, price: true },
  });
  type ServicioPedido = (typeof servicios)[number];
  const porId = new Map(servicios.map((s) => [s.id, s]));
  const lineas: { servicio: ServicioPedido; qty: number }[] = [];
  for (const i of items) {
    const servicio = porId.get(i.serviceId);
    if (servicio) lineas.push({ servicio, qty: Math.max(1, Math.min(MAX_QTY_POR_ITEM, Math.round(i.qty) || 1)) });
  }
  if (lineas.length === 0) return { error: "Esos productos ya no están disponibles." };

  const user = await db.user.findUnique({ where: { id: mesa.userId }, select: { timezone: true } });
  const day = todayIn(user?.timezone ?? "America/Bogota");
  const notaLimpia = nota?.trim().slice(0, 200) || null;

  const orderId = await db.$transaction(async (tx) => {
    const previa = await tx.order.findFirst({ where: { tableId: mesa.id, status: "ABIERTA" } });
    const order =
      previa ??
      (await tx.order.create({
        data: { userId: mesa.userId, tableId: mesa.id, label: "Mesa " + mesa.number, day },
      }));

    for (const l of lineas) {
      const existente = await tx.orderItem.findFirst({ where: { orderId: order.id, serviceId: l.servicio.id } });
      if (existente) {
        await tx.orderItem.update({ where: { id: existente.id }, data: { qty: existente.qty + l.qty } });
      } else {
        await tx.orderItem.create({
          data: { userId: mesa.userId, orderId: order.id, serviceId: l.servicio.id, name: l.servicio.name, unitPrice: l.servicio.price, qty: l.qty },
        });
      }
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        hasNewFromCustomer: true,
        notes: notaLimpia ? (order.notes ? order.notes + " | " + notaLimpia : notaLimpia) : order.notes,
      },
    });

    return order.id;
  });

  return { ok: "Pedido enviado.", orderId };
}

/**
 * Toca una mesa desde el piso del panel: si ya tiene una cuenta abierta,
 * entra a esa; si esta libre, le abre una. Nunca duplica cuentas de una mesa.
 */
export async function ordenDeMesa(
  userId: string,
  tableId: string
): Promise<{ orderId: string; creada: boolean; label: string } | { error: string }> {
  const mesa = await db.table.findFirst({ where: { id: tableId, userId, active: true } });
  if (!mesa) return { error: "No encontramos esa mesa." };

  const previa = await db.order.findFirst({ where: { tableId: mesa.id, status: "ABIERTA" } });
  if (previa) return { orderId: previa.id, creada: false, label: previa.label };

  const label = "Mesa " + mesa.number;
  const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const orden = await db.order.create({
    data: { userId, tableId: mesa.id, label, day: todayIn(user?.timezone ?? "America/Bogota") },
  });
  return { orderId: orden.id, creada: true, label };
}

/** Cuantas cuentas de mesa tienen algo nuevo del cliente sin ver. Para el aviso del panel. */
export async function pedidosNuevosSinVer(userId: string): Promise<number> {
  return db.order.count({ where: { userId, status: "ABIERTA", hasNewFromCustomer: true } });
}

/** El mesero ya vio el pedido: se apaga el aviso. */
export async function marcarPedidoVisto(userId: string, orderId: string): Promise<void> {
  await db.order.updateMany({ where: { id: orderId, userId, hasNewFromCustomer: true }, data: { hasNewFromCustomer: false } });
}
