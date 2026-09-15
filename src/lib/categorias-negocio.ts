import { db } from "./db";
import {
  CATEGORIA_GENERAL,
  mismaCategoria,
  nombreCategoria,
  validarNombreCategoria,
} from "./categorias";

/**
 * Las categorias que arma cada negocio: las crea, les pone el nombre que
 * quiere, las ordena y decide que productos van en cada una.
 *
 * El producto guarda el nombre de su categoria (Service.category); esta tabla
 * guarda cuales existen y en que orden salen en el panel, la venta y el
 * portafolio. "General" no se guarda: es donde queda lo que no tiene
 * categoria y siempre va de ultima.
 */

export const MAX_CATEGORIAS = 200;

export type Resultado = { ok: string } | { error: string };

export async function categoriasDelNegocio(userId: string) {
  return db.productCategory.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, name: true, position: true },
  });
}

/** Solo los nombres, en el orden del dueño. */
export async function ordenDeCategorias(userId: string): Promise<string[]> {
  return (await categoriasDelNegocio(userId)).map((c) => c.name);
}

/**
 * Deja creadas, al final, las categorias escritas al guardar productos. Dice
 * con que nombre quedo cada una: si ya existe "Bebidas" y escriben "bebidas",
 * se usa "Bebidas" y no aparece una categoria repetida.
 */
export async function asegurarCategorias(userId: string, nombres: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const existentes = await db.productCategory.findMany({ where: { userId }, select: { name: true, position: true } });
  let ultima = existentes.reduce((m, c) => Math.max(m, c.position), -1);
  const nuevas: { userId: string; name: string; position: number }[] = [];

  for (const pedido of nombres) {
    if (mapa.has(pedido)) continue;
    const limpio = nombreCategoria(pedido);
    if (mismaCategoria(limpio, CATEGORIA_GENERAL)) {
      mapa.set(pedido, CATEGORIA_GENERAL);
      continue;
    }
    const ya = existentes.find((c) => mismaCategoria(c.name, limpio)) ?? nuevas.find((c) => mismaCategoria(c.name, limpio));
    if (ya) {
      mapa.set(pedido, ya.name);
      continue;
    }
    ultima += 1;
    nuevas.push({ userId, name: limpio, position: ultima });
    mapa.set(pedido, limpio);
  }

  if (nuevas.length > 0) await db.productCategory.createMany({ data: nuevas, skipDuplicates: true });
  return mapa;
}

/**
 * Pone en orden las categorias de los productos que llegaron por otro lado
 * (carga desde Excel, algo guardado sin señal): las crea si faltan y junta las
 * que solo cambian en mayusculas, tildes o espacios.
 */
export async function sincronizarCategorias(userId: string): Promise<void> {
  const usadas = await db.service.groupBy({ by: ["category"], where: { userId }, _count: { _all: true } });
  // La mas usada pone el nombre cuando hay dos escrituras de la misma.
  const nombres = usadas
    .sort((a, b) => b._count._all - a._count._all || a.category.localeCompare(b.category, "es"))
    .map((u) => u.category);
  const mapa = await asegurarCategorias(userId, nombres);
  for (const [antes, despues] of mapa) {
    if (antes !== despues) {
      await db.service.updateMany({ where: { userId, category: antes }, data: { category: despues } });
    }
  }
}

export async function crearCategoria(userId: string, pedido: string): Promise<Resultado> {
  const v = validarNombreCategoria(pedido);
  if ("error" in v) return v;
  const existentes = await db.productCategory.findMany({ where: { userId }, select: { name: true, position: true } });
  const ya = existentes.find((c) => mismaCategoria(c.name, v.nombre));
  if (ya) return { error: "Ya tienes la categoría " + ya.name + "." };
  if (existentes.length >= MAX_CATEGORIAS) {
    return { error: "Ya tienes " + MAX_CATEGORIAS + " categorías. Junta o borra alguna para crear otra." };
  }
  const position = existentes.reduce((m, c) => Math.max(m, c.position), -1) + 1;
  await db.productCategory.create({ data: { userId, name: v.nombre, position } });
  return { ok: "Categoría " + v.nombre + " creada." };
}

/**
 * Cambia el nombre y se lo cambia a sus productos. Si el nombre nuevo es el de
 * otra categoria, las junta: es la forma natural de unir "Gaseosas" y "Bebidas".
 */
export async function renombrarCategoria(userId: string, id: string, pedido: string): Promise<Resultado> {
  const v = validarNombreCategoria(pedido);
  if ("error" in v) return v;
  const cat = await db.productCategory.findFirst({ where: { id, userId } });
  if (!cat) return { error: "No encontramos esa categoría." };
  if (v.nombre === cat.name) return { ok: "El nombre quedó igual." };

  const otras = await db.productCategory.findMany({ where: { userId, NOT: { id } }, select: { id: true, name: true } });
  const otra = otras.find((c) => mismaCategoria(c.name, v.nombre));
  if (otra) {
    const movidos = await db.$transaction(async (tx) => {
      const r = await tx.service.updateMany({ where: { userId, category: cat.name }, data: { category: otra.name } });
      await tx.productCategory.delete({ where: { id: cat.id } });
      return r.count;
    });
    return { ok: "Se juntó con " + otra.name + (movidos > 0 ? ": " + movidos + " productos pasaron ahí." : ".") };
  }

  await db.$transaction([
    db.productCategory.update({ where: { id: cat.id }, data: { name: v.nombre } }),
    db.service.updateMany({ where: { userId, category: cat.name }, data: { category: v.nombre } }),
  ]);
  return { ok: "Ahora se llama " + v.nombre + "." };
}

/** Borra la categoria; sus productos no se borran, pasan a General. */
export async function borrarCategoria(userId: string, id: string): Promise<Resultado> {
  const cat = await db.productCategory.findFirst({ where: { id, userId } });
  if (!cat) return { error: "No encontramos esa categoría." };
  const [movidos] = await db.$transaction([
    db.service.updateMany({ where: { userId, category: cat.name }, data: { category: CATEGORIA_GENERAL } }),
    db.productCategory.delete({ where: { id: cat.id } }),
  ]);
  return {
    ok: "Borraste " + cat.name + (movidos.count > 0 ? ". Sus " + movidos.count + " productos quedaron en General." : "."),
  };
}

/** Sube o baja una categoria un lugar. */
export async function moverCategoria(userId: string, id: string, direccion: "arriba" | "abajo"): Promise<Resultado> {
  const lista = await db.productCategory.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  const i = lista.findIndex((c) => c.id === id);
  if (i < 0) return { error: "No encontramos esa categoría." };
  const j = direccion === "arriba" ? i - 1 : i + 1;
  if (j < 0 || j >= lista.length) return { ok: "Ya está en ese lugar." };
  [lista[i], lista[j]] = [lista[j], lista[i]];
  await db.$transaction(lista.map((c, n) => db.productCategory.update({ where: { id: c.id }, data: { position: n } })));
  return { ok: "Orden guardado." };
}

/**
 * Los productos marcados quedan en la categoria; los que estaban en ella y se
 * desmarcaron pasan a General. Solo toca productos de este negocio.
 */
export async function asignarProductos(userId: string, id: string, productos: string[]): Promise<Resultado> {
  const cat = await db.productCategory.findFirst({ where: { id, userId } });
  if (!cat) return { error: "No encontramos esa categoría." };
  const ids = [...new Set(productos.filter(Boolean))].slice(0, 5000);
  const [entran, salen] = await db.$transaction([
    db.service.updateMany({
      where: { userId, id: { in: ids }, category: { not: cat.name } },
      data: { category: cat.name },
    }),
    db.service.updateMany({
      where: { userId, category: cat.name, id: { notIn: ids } },
      data: { category: CATEGORIA_GENERAL },
    }),
  ]);
  if (entran.count === 0 && salen.count === 0) return { ok: "No hubo cambios." };
  const partes = [
    entran.count > 0 ? entran.count + (entran.count === 1 ? " producto entró" : " productos entraron") : "",
    salen.count > 0 ? salen.count + (salen.count === 1 ? " pasó" : " pasaron") + " a General" : "",
  ].filter(Boolean);
  return { ok: "Guardado: " + partes.join(" y ") + "." };
}
