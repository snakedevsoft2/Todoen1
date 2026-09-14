import type { BusinessType, Prisma } from "@prisma/client";
import { db } from "./db";
import { llaveTelefono } from "./crm";
import { LIMITE_CLIENTES } from "./clientes";
import { todayIn } from "./dates";
import { parseMoney } from "./format";
import { applyStockMove } from "./inventory";
import { LIMITE_FILAS } from "./importar";

/**
 * Subir de una vez la lista de clientes o de productos que el negocio ya
 * tenia en Excel.
 *
 * Nunca duplica: un cliente con el mismo telefono (o con el mismo nombre y sin
 * telefono) es el mismo, y un producto con el mismo nombre es el mismo. Al
 * cliente repetido solo se le llenan los datos que le faltaban; al producto
 * repetido se le actualiza lo que traiga la fila, porque subir la lista de
 * precios nueva es justo para eso.
 */

export type ResultadoCarga = { creados: number; actualizados: number; omitidos: number; detalle: string[] };

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_DETALLE = 12;

function anotar(r: ResultadoCarga, fila: number, motivo: string) {
  r.omitidos += 1;
  if (r.detalle.length < MAX_DETALLE) r.detalle.push("Fila " + fila + ": " + motivo);
}

type ClienteBase = {
  id: string | null;
  name: string;
  phone: string | null;
  phoneKey: string | null;
  email: string | null;
  document: string | null;
  address: string | null;
  notes: string | null;
};

export async function cargarClientes(userId: string, crudo: unknown): Promise<ResultadoCarga> {
  const filas = (Array.isArray(crudo) ? crudo : []).slice(0, LIMITE_FILAS) as Record<string, unknown>[];
  const r: ResultadoCarga = { creados: 0, actualizados: 0, omitidos: 0, detalle: [] };

  const existentes: ClienteBase[] = await db.customer.findMany({
    where: { userId },
    select: { id: true, name: true, phone: true, phoneKey: true, email: true, document: true, address: true, notes: true },
  });
  const porTelefono = new Map<string, ClienteBase>();
  const porNombre = new Map<string, ClienteBase>();
  const registrar = (c: ClienteBase) => {
    if (c.phoneKey) porTelefono.set(c.phoneKey, c);
    if (!porNombre.has(c.name.toLowerCase())) porNombre.set(c.name.toLowerCase(), c);
  };
  existentes.forEach(registrar);

  const nuevos: ClienteBase[] = [];
  const cambios = new Map<string, Prisma.CustomerUpdateInput>();
  let cupo = LIMITE_CLIENTES - existentes.length;

  filas.forEach((f, i) => {
    const numeroFila = i + 1;
    const name = texto(f?.name, 200);
    if (!name) return anotar(r, numeroFila, "sin nombre");
    const phone = texto(f?.phone, 40) || null;
    const phoneKey = llaveTelefono(phone);
    const correo = texto(f?.email, 120);
    const email = correo && CORREO.test(correo) ? correo : null;
    const datos = {
      email,
      document: texto(f?.document, 30) || null,
      address: texto(f?.address, 200) || null,
      notes: texto(f?.notes, 500) || null,
    };

    // El mismo telefono es la misma persona; sin telefono, el mismo nombre.
    const mismoNombre = porNombre.get(name.toLowerCase());
    const previo = (phoneKey && porTelefono.get(phoneKey)) || (mismoNombre && (!phoneKey || !mismoNombre.phoneKey) ? mismoNombre : null);

    if (previo) {
      const faltantes: Record<string, string> = {};
      if (phoneKey && !previo.phoneKey && !porTelefono.has(phoneKey)) {
        faltantes.phone = phone!;
        faltantes.phoneKey = phoneKey;
      }
      for (const campo of ["email", "document", "address", "notes"] as const) {
        if (datos[campo] && !previo[campo]) faltantes[campo] = datos[campo]!;
      }
      if (Object.keys(faltantes).length === 0) return anotar(r, numeroFila, name + " ya estaba");
      Object.assign(previo, faltantes);
      registrar(previo);
      if (previo.id) {
        cambios.set(previo.id, { ...(cambios.get(previo.id) ?? {}), ...faltantes });
        r.actualizados += 1;
      }
      return;
    }

    if (cupo <= 0) return anotar(r, numeroFila, "se llegó al tope de clientes");
    cupo -= 1;
    const nuevo: ClienteBase = { id: null, name, phone, phoneKey, ...datos };
    nuevos.push(nuevo);
    registrar(nuevo);
  });

  if (nuevos.length > 0) {
    const hecho = await db.customer.createMany({
      data: nuevos.map((n) => ({ userId, source: "importado", ...n, id: undefined })),
      skipDuplicates: true,
    });
    r.creados = hecho.count;
    r.omitidos += nuevos.length - hecho.count;
  }
  for (const [id, data] of cambios) {
    await db.customer.update({ where: { id }, data });
  }
  return r;
}

type ProductoBase = {
  id: string;
  name: string;
  trackStock: boolean;
  variants: { id: string; stock: number }[];
};

export async function cargarProductos(
  user: { id: string; currency: string; timezone: string; businessType: BusinessType },
  crudo: unknown
): Promise<ResultadoCarga> {
  const filas = (Array.isArray(crudo) ? crudo : []).slice(0, LIMITE_FILAS) as Record<string, unknown>[];
  const r: ResultadoCarga = { creados: 0, actualizados: 0, omitidos: 0, detalle: [] };
  const hoy = todayIn(user.timezone);

  const existentes: ProductoBase[] = await db.service.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, trackStock: true, variants: { select: { id: true, stock: true }, take: 2 } },
  });
  const porNombre = new Map(existentes.map((p) => [p.name.toLowerCase(), p]));
  const vistos = new Set<string>();
  const sinStock: Prisma.ServiceCreateManyInput[] = [];

  for (const [i, f] of filas.entries()) {
    const numeroFila = i + 1;
    const name = texto(f?.name, 200);
    if (!name) {
      anotar(r, numeroFila, "sin nombre");
      continue;
    }
    if (vistos.has(name.toLowerCase())) {
      anotar(r, numeroFila, name + " está repetido en la lista");
      continue;
    }
    vistos.add(name.toLowerCase());

    const precioTexto = texto(f?.price, 30);
    const price = precioTexto ? parseMoney(precioTexto, user.currency) : null;
    const costoTexto = texto(f?.cost, 30);
    const cost = costoTexto ? parseMoney(costoTexto, user.currency) : null;
    const category = texto(f?.category, 60) || null;
    const description = texto(f?.description, 500) || null;
    const stockTexto = texto(f?.stock, 12).replace(/[^\d]/g, "");
    const stock = stockTexto ? Math.min(1_000_000, Number(stockTexto)) : null;

    const previo = porNombre.get(name.toLowerCase());
    if (previo) {
      const data: Prisma.ServiceUpdateInput = {
        ...(price !== null ? { price } : {}),
        ...(cost !== null ? { cost } : {}),
        ...(category ? { category } : {}),
        ...(description ? { description } : {}),
      };
      await db.$transaction(async (tx) => {
        if (Object.keys(data).length > 0) await tx.service.update({ where: { id: previo.id }, data });
        if (stock === null) return;
        // La cantidad de la lista es lo que hay: se ajusta la diferencia.
        if (previo.variants.length === 1) {
          const talla = previo.variants[0];
          if (talla.stock !== stock) {
            await applyStockMove(tx, {
              userId: user.id,
              variantId: talla.id,
              type: "AJUSTE",
              delta: stock - talla.stock,
              day: hoy,
              reason: "Carga masiva",
              blockNegative: false,
            });
          }
        } else if (previo.variants.length === 0) {
          await tx.service.update({ where: { id: previo.id }, data: { trackStock: true } });
          const talla = await tx.productVariant.create({ data: { userId: user.id, serviceId: previo.id, size: "Unica", color: "Unico" } });
          if (stock > 0) {
            await applyStockMove(tx, { userId: user.id, variantId: talla.id, type: "ENTRADA", delta: stock, day: hoy, reason: "Carga masiva" });
          }
        }
      });
      r.actualizados += 1;
      continue;
    }

    if (price === null || price < 0) {
      anotar(r, numeroFila, name + " no tiene precio");
      continue;
    }
    const base = {
      userId: user.id,
      name,
      price,
      cost: cost ?? 0,
      category: category ?? "General",
      description,
      bookable: user.businessType === "BARBERIA",
    };
    if (stock === null) {
      sinStock.push(base);
      continue;
    }
    // Con cantidad: la prenda queda con inventario y una talla unica.
    await db.$transaction(async (tx) => {
      const servicio = await tx.service.create({ data: { ...base, trackStock: true } });
      const talla = await tx.productVariant.create({ data: { userId: user.id, serviceId: servicio.id, size: "Unica", color: "Unico" } });
      if (stock > 0) {
        await applyStockMove(tx, { userId: user.id, variantId: talla.id, type: "ENTRADA", delta: stock, day: hoy, reason: "Carga masiva" });
      }
    });
    r.creados += 1;
  }

  if (sinStock.length > 0) {
    const hecho = await db.service.createMany({ data: sinStock });
    r.creados += hecho.count;
  }
  return r;
}
