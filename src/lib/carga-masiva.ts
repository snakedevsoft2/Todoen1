import type { BusinessType, Prisma } from "@prisma/client";
import { db } from "./db";
import { llaveNombre, llaveTelefono } from "./crm";
import { LIMITE_CLIENTES } from "./clientes";
import { todayIn } from "./dates";
import { money, parseMoney } from "./format";
import { applyStockMove } from "./inventory";
import { LIMITE_FILAS } from "./importar";
import { sincronizarCategorias } from "./categorias-negocio";

/**
 * Subir de una vez la lista de clientes o de productos que el negocio ya
 * tenia en Excel.
 *
 * Nunca duplica. Un cliente es el mismo si coincide el telefono, el correo o
 * el documento; si no trae ninguno de esos, el mismo nombre. Un producto es el
 * mismo si se llama igual.
 *
 * Antes de guardar se revisa el archivo contra lo que ya hay (analizar*): la
 * pantalla dice cuantos son nuevos, cuantos ya estaban y que cambia, y
 * pregunta que hacer con los que ya estaban:
 *   - completar: al cliente solo se le llenan los datos que le faltaban; el
 *     producto que ya existia no se toca.
 *   - sobrescribir: lo que trae el archivo reemplaza lo que habia.
 * En los dos casos una celda vacia no borra nada.
 */

export type ModoCarga = "completar" | "sobrescribir";
export type ResultadoCarga = { creados: number; actualizados: number; omitidos: number; detalle: string[] };
export type CambioCampo = { campo: string; antes: string; despues: string };
export type Analisis = {
  filas: number;
  /** Los que se van a crear. */
  nuevos: number;
  /** Cuantos de los que ya estaban guardados aparecen en la lista. */
  repetidos: number;
  /** De esos, cuantos traen algun dato distinto. */
  conCambios: number;
  /** Filas que no se van a cargar: sin nombre, repetidas en la lista, sin precio... */
  omitidos: number;
  ejemplos: { nombre: string; cambios: CambioCampo[] }[];
};

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_DETALLE = 12;
const MAX_EJEMPLOS = 5;
const LOTE = 100;

function nota(r: ResultadoCarga, fila: number, motivo: string) {
  if (r.detalle.length < MAX_DETALLE) r.detalle.push("Fila " + fila + ": " + motivo);
}

function anotar(r: ResultadoCarga, fila: number, motivo: string) {
  r.omitidos += 1;
  nota(r, fila, motivo);
}

const analisisVacio = (filas: number): Analisis => ({ filas, nuevos: 0, repetidos: 0, conCambios: 0, omitidos: 0, ejemplos: [] });

// ------------------------------------------------------------------ CLIENTES

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
type CampoEditable = "name" | "phone" | "email" | "document" | "address" | "notes";

const TITULO_CLIENTE: Record<CampoEditable, string> = {
  name: "nombre",
  phone: "teléfono",
  email: "correo",
  document: "documento",
  address: "dirección",
  notes: "notas",
};

const llaveCorreo = (e: string | null) => (e ? e.trim().toLowerCase() : null);
function llaveDocumento(d: string | null): string | null {
  const x = (d ?? "").replace(/[^0-9a-z]/gi, "").toLowerCase();
  return x.length >= 5 ? x : null;
}
const mismoDocumento = (a: string, b: string | null) =>
  (llaveDocumento(a) ?? a.trim().toLowerCase()) === (llaveDocumento(b) ?? (b ?? "").trim().toLowerCase());

async function procesarClientes(userId: string, crudo: unknown, modo: ModoCarga, escribir: boolean) {
  const filas = (Array.isArray(crudo) ? crudo : []).slice(0, LIMITE_FILAS) as Record<string, unknown>[];
  const r: ResultadoCarga = { creados: 0, actualizados: 0, omitidos: 0, detalle: [] };
  const a = analisisVacio(filas.length);

  const existentes: ClienteBase[] = await db.customer.findMany({
    where: { userId },
    select: { id: true, name: true, phone: true, phoneKey: true, email: true, document: true, address: true, notes: true },
  });
  const porTelefono = new Map<string, ClienteBase>();
  const porCorreo = new Map<string, ClienteBase>();
  const porDocumento = new Map<string, ClienteBase>();
  const porNombre = new Map<string, ClienteBase>();
  const registrar = (c: ClienteBase) => {
    if (c.phoneKey) porTelefono.set(c.phoneKey, c);
    const e = llaveCorreo(c.email);
    if (e && !porCorreo.has(e)) porCorreo.set(e, c);
    const d = llaveDocumento(c.document);
    if (d && !porDocumento.has(d)) porDocumento.set(d, c);
    const n = llaveNombre(c.name);
    if (n && !porNombre.has(n)) porNombre.set(n, c);
  };
  existentes.forEach(registrar);

  const nuevos: ClienteBase[] = [];
  const cambios = new Map<string, Prisma.CustomerUpdateInput>();
  const tocados = new Set<string>();
  const vistosRepetidos = new Set<string>();
  let cupo = LIMITE_CLIENTES - existentes.length;

  filas.forEach((f, i) => {
    const numeroFila = i + 1;
    const name = texto(f?.name, 200);
    if (!name) {
      a.omitidos += 1;
      return anotar(r, numeroFila, "sin nombre");
    }
    const phone = texto(f?.phone, 40) || null;
    const phoneKey = llaveTelefono(phone);
    const correo = texto(f?.email, 120).toLowerCase();
    const email = correo && CORREO.test(correo) ? correo : null;
    const datos = {
      email,
      document: texto(f?.document, 30) || null,
      address: texto(f?.address, 200) || null,
      notes: texto(f?.notes, 500) || null,
    };

    // Con quien coincide por cada dato. Si el telefono es de uno y el correo de
    // otro, no se adivina: se salta y se avisa.
    const docKey = llaveDocumento(datos.document);
    const candidatos = [
      phoneKey ? porTelefono.get(phoneKey) : undefined,
      email ? porCorreo.get(email) : undefined,
      docKey ? porDocumento.get(docKey) : undefined,
    ].filter((c): c is ClienteBase => Boolean(c));
    const distintos = [...new Set(candidatos)];
    if (distintos.length > 1) {
      a.omitidos += 1;
      return anotar(r, numeroFila, name + " coincide con dos clientes distintos (" + distintos.map((c) => c.name).join(" y ") + ")");
    }
    const mismoNombre = porNombre.get(llaveNombre(name));
    const previo =
      distintos[0] ??
      (mismoNombre &&
      (!phoneKey || !mismoNombre.phoneKey) &&
      (!email || !mismoNombre.email || llaveCorreo(mismoNombre.email) === email)
        ? mismoNombre
        : null);

    if (!previo) {
      if (cupo <= 0) {
        a.omitidos += 1;
        return anotar(r, numeroFila, "se llegó al tope de clientes");
      }
      cupo -= 1;
      const nuevo: ClienteBase = { id: null, name, phone, phoneKey, ...datos };
      nuevos.push(nuevo);
      registrar(nuevo);
      a.nuevos += 1;
      return;
    }

    // Lo que trae la fila distinto de lo que ya estaba. Una celda vacia no cuenta.
    const diferentes: { campo: CampoEditable; valor: string }[] = [];
    if (llaveNombre(name) !== llaveNombre(previo.name)) diferentes.push({ campo: "name", valor: name });
    if (phoneKey && phoneKey !== previo.phoneKey) diferentes.push({ campo: "phone", valor: phone! });
    if (email && email !== llaveCorreo(previo.email)) diferentes.push({ campo: "email", valor: email });
    if (datos.document && !mismoDocumento(datos.document, previo.document)) {
      diferentes.push({ campo: "document", valor: datos.document });
    }
    if (datos.address && datos.address !== (previo.address ?? "")) diferentes.push({ campo: "address", valor: datos.address });
    if (datos.notes && datos.notes !== (previo.notes ?? "")) diferentes.push({ campo: "notes", valor: datos.notes });

    if (previo.id && !vistosRepetidos.has(previo.id)) {
      vistosRepetidos.add(previo.id);
      a.repetidos += 1;
      if (diferentes.length > 0) {
        a.conCambios += 1;
        if (a.ejemplos.length < MAX_EJEMPLOS) {
          a.ejemplos.push({
            nombre: previo.name,
            cambios: diferentes.map((d) => ({ campo: TITULO_CLIENTE[d.campo], antes: previo[d.campo] ?? "", despues: d.valor })),
          });
        }
      }
    }

    const aplicar = modo === "sobrescribir" ? diferentes : diferentes.filter((d) => d.campo !== "name" && !previo[d.campo]);
    const data: Record<string, string> = {};
    for (const d of aplicar) {
      if (d.campo !== "phone") {
        data[d.campo] = d.valor;
        continue;
      }
      const llave = llaveTelefono(d.valor)!;
      const dueno = porTelefono.get(llave);
      if (dueno && dueno !== previo) {
        nota(r, numeroFila, "el teléfono " + d.valor + " ya es de " + dueno.name + ", no se le cambió a " + previo.name);
        continue;
      }
      if (previo.phoneKey && porTelefono.get(previo.phoneKey) === previo) porTelefono.delete(previo.phoneKey);
      data.phone = d.valor;
      data.phoneKey = llave;
    }

    if (Object.keys(data).length === 0) return anotar(r, numeroFila, previo.name + " ya estaba");
    Object.assign(previo, data);
    registrar(previo);
    if (previo.id) {
      cambios.set(previo.id, { ...(cambios.get(previo.id) ?? {}), ...data });
      if (!tocados.has(previo.id)) {
        tocados.add(previo.id);
        r.actualizados += 1;
      }
    }
  });

  if (!escribir) return { resultado: r, analisis: a };

  if (nuevos.length > 0) {
    const hecho = await db.customer.createMany({
      data: nuevos.map(({ id: _id, ...n }) => ({ userId, source: "importado", ...n })),
      skipDuplicates: true,
    });
    r.creados = hecho.count;
    r.omitidos += nuevos.length - hecho.count;
  }
  await actualizarEnLotes([...cambios.entries()], (id, data) => db.customer.update({ where: { id }, data }), r);
  return { resultado: r, analisis: a };
}

/** Los cambios en lotes; si un lote falla (dos clientes que se cambian el telefono), uno por uno. */
async function actualizarEnLotes<T>(
  lista: [string, T][],
  actualizar: (id: string, data: T) => Prisma.PrismaPromise<unknown>,
  r: ResultadoCarga
) {
  for (let i = 0; i < lista.length; i += LOTE) {
    const lote = lista.slice(i, i + LOTE);
    try {
      await db.$transaction(lote.map(([id, data]) => actualizar(id, data)));
    } catch {
      for (const [id, data] of lote) {
        try {
          await actualizar(id, data);
        } catch {
          r.actualizados -= 1;
          r.omitidos += 1;
        }
      }
    }
  }
}

export async function analizarClientes(userId: string, crudo: unknown): Promise<Analisis> {
  return (await procesarClientes(userId, crudo, "completar", false)).analisis;
}

export async function cargarClientes(userId: string, crudo: unknown, modo: ModoCarga = "completar"): Promise<ResultadoCarga> {
  return (await procesarClientes(userId, crudo, modo, true)).resultado;
}

// ----------------------------------------------------------------- PRODUCTOS

type ProductoBase = {
  id: string;
  name: string;
  price: number;
  cost: number | null;
  category: string;
  description: string | null;
  trackStock: boolean;
  variants: { id: string; stock: number }[];
};

type Negocio = { id: string; currency: string; timezone: string; businessType: BusinessType };

async function procesarProductos(user: Negocio, crudo: unknown, modo: ModoCarga, escribir: boolean) {
  const filas = (Array.isArray(crudo) ? crudo : []).slice(0, LIMITE_FILAS) as Record<string, unknown>[];
  const r: ResultadoCarga = { creados: 0, actualizados: 0, omitidos: 0, detalle: [] };
  const a = analisisVacio(filas.length);
  const hoy = todayIn(user.timezone);

  const existentes: ProductoBase[] = await db.service.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      price: true,
      cost: true,
      category: true,
      description: true,
      trackStock: true,
      variants: { select: { id: true, stock: true }, take: 2 },
    },
  });
  const porNombre = new Map(existentes.map((p) => [llaveNombre(p.name), p]));
  const vistos = new Set<string>();
  const sinStock: Prisma.ServiceCreateManyInput[] = [];

  for (const [i, f] of filas.entries()) {
    const numeroFila = i + 1;
    const name = texto(f?.name, 200);
    if (!name) {
      a.omitidos += 1;
      anotar(r, numeroFila, "sin nombre");
      continue;
    }
    const llave = llaveNombre(name);
    if (vistos.has(llave)) {
      a.omitidos += 1;
      anotar(r, numeroFila, name + " está repetido en la lista");
      continue;
    }
    vistos.add(llave);

    const precioTexto = texto(f?.price, 30);
    const price = precioTexto ? parseMoney(precioTexto, user.currency) : null;
    const costoTexto = texto(f?.cost, 30);
    const cost = costoTexto ? parseMoney(costoTexto, user.currency) : null;
    const category = texto(f?.category, 60) || null;
    const description = texto(f?.description, 500) || null;
    const stockTexto = texto(f?.stock, 12).replace(/[^\d]/g, "");
    const stock = stockTexto ? Math.min(1_000_000, Number(stockTexto)) : null;

    const previo = porNombre.get(llave);
    if (previo) {
      a.repetidos += 1;
      const diferentes: CambioCampo[] = [];
      if (price !== null && price !== previo.price) {
        diferentes.push({ campo: "precio", antes: money(previo.price, user.currency), despues: money(price, user.currency) });
      }
      if (cost !== null && cost !== (previo.cost ?? 0)) {
        diferentes.push({ campo: "costo", antes: money(previo.cost ?? 0, user.currency), despues: money(cost, user.currency) });
      }
      if (category && category !== previo.category) diferentes.push({ campo: "categoría", antes: previo.category, despues: category });
      if (description && description !== (previo.description ?? "")) {
        diferentes.push({ campo: "descripción", antes: previo.description ?? "", despues: description });
      }
      const stockActual = previo.variants.length === 1 ? previo.variants[0].stock : previo.variants.length === 0 ? null : undefined;
      if (stock !== null && stockActual !== undefined && stock !== stockActual) {
        diferentes.push({ campo: "cantidad", antes: stockActual === null ? "sin inventario" : String(stockActual), despues: String(stock) });
      }
      if (diferentes.length > 0) {
        a.conCambios += 1;
        if (a.ejemplos.length < MAX_EJEMPLOS) a.ejemplos.push({ nombre: previo.name, cambios: diferentes });
      }

      if (modo === "completar") {
        anotar(r, numeroFila, previo.name + " ya estaba");
        continue;
      }
      if (!escribir) continue;

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
      a.omitidos += 1;
      anotar(r, numeroFila, name + " no tiene precio");
      continue;
    }
    a.nuevos += 1;
    if (!escribir) continue;

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
    // Con cantidad: el producto queda con inventario y una talla unica.
    await db.$transaction(async (tx) => {
      const servicio = await tx.service.create({ data: { ...base, trackStock: true } });
      const talla = await tx.productVariant.create({ data: { userId: user.id, serviceId: servicio.id, size: "Unica", color: "Unico" } });
      if (stock > 0) {
        await applyStockMove(tx, { userId: user.id, variantId: talla.id, type: "ENTRADA", delta: stock, day: hoy, reason: "Carga masiva" });
      }
    });
    r.creados += 1;
  }

  if (escribir && sinStock.length > 0) {
    const hecho = await db.service.createMany({ data: sinStock });
    r.creados += hecho.count;
  }
  // Las categorias del archivo quedan creadas y sin repetidas.
  if (escribir) await sincronizarCategorias(user.id);
  return { resultado: r, analisis: a };
}

export async function analizarProductos(user: Negocio, crudo: unknown): Promise<Analisis> {
  return (await procesarProductos(user, crudo, "sobrescribir", false)).analisis;
}

export async function cargarProductos(user: Negocio, crudo: unknown, modo: ModoCarga = "sobrescribir"): Promise<ResultadoCarga> {
  return (await procesarProductos(user, crudo, modo, true)).resultado;
}
