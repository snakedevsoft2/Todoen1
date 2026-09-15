/**
 * Categorias, busqueda y orden de los productos.
 *
 * Con muchos productos la lista se vuelve un scroll eterno: en el catalogo del
 * panel, en la venta y en el portafolio publico se toca una categoria o se
 * escribe parte del nombre y aparece solo eso. Las tres pantallas usan estas
 * mismas reglas para que el orden sea igual en todas.
 *
 * Archivo puro: corre en el navegador.
 */

export const CATEGORIA_GENERAL = "General";

/** Largo maximo del nombre de una categoria. */
export const MAX_CATEGORIA = 40;

export type OrdenCatalogo = "nombre" | "precio-menor" | "precio-mayor" | "recientes";

export const ORDENES: { valor: OrdenCatalogo; nombre: string }[] = [
  { valor: "nombre", nombre: "Nombre (A-Z)" },
  { valor: "precio-menor", nombre: "Precio: menor a mayor" },
  { valor: "precio-mayor", nombre: "Precio: mayor a menor" },
  { valor: "recientes", nombre: "Los más nuevos" },
];

export function esOrden(v: unknown): v is OrdenCatalogo {
  return ORDENES.some((o) => o.valor === v);
}

const comparar = new Intl.Collator("es", { sensitivity: "base", numeric: true }).compare;

/** "Camisetas Niño " -> "camisetas nino": sin tildes ni mayusculas. */
export function textoBusqueda(texto: string | null | undefined): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Cada palabra buscada tiene que estar en alguno de los textos, en cualquier orden. */
export function coincideBusqueda(textos: (string | null | undefined)[], busqueda: string): boolean {
  const palabras = textoBusqueda(busqueda).split(" ").filter(Boolean);
  if (palabras.length === 0) return true;
  const donde = textoBusqueda(textos.join(" "));
  return palabras.every((p) => donde.includes(p));
}

/** Sin espacios de sobra y del largo permitido. */
export function limpiarNombreCategoria(nombre: string | null | undefined): string {
  return String(nombre ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CATEGORIA).trim();
}

/** El nombre de la categoria como se muestra: vacia cuenta como "General". */
export function nombreCategoria(categoria: string | null | undefined): string {
  return limpiarNombreCategoria(categoria) || CATEGORIA_GENERAL;
}

/** "Bebidas" y "bébidas " son la misma categoria. */
export function mismaCategoria(a: string, b: string): boolean {
  return textoBusqueda(a) === textoBusqueda(b);
}

export function validarNombreCategoria(nombre: string | null | undefined): { nombre: string } | { error: string } {
  const limpio = limpiarNombreCategoria(nombre);
  if (!limpio) return { error: "Escribe el nombre de la categoría." };
  if (mismaCategoria(limpio, CATEGORIA_GENERAL)) {
    return { error: "General ya existe: es donde queda lo que no tiene categoría." };
  }
  return { nombre: limpio };
}

/**
 * Las categorias con cuantos productos tiene cada una. Primero en el orden
 * que armo el dueño; las que no estan en ese orden, en orden alfabetico
 * ("Talla 2" antes que "Talla 10"); y "General" al final.
 */
export function categoriasConCantidad(
  items: { category: string }[],
  ordenPropio: string[] = []
): { nombre: string; cantidad: number }[] {
  const lugar = new Map(ordenPropio.map((n, i) => [n, i]));
  const cuenta = new Map<string, number>();
  for (const i of items) {
    const c = nombreCategoria(i.category);
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => {
      if (a.nombre === CATEGORIA_GENERAL) return 1;
      if (b.nombre === CATEGORIA_GENERAL) return -1;
      const la = lugar.get(a.nombre);
      const lb = lugar.get(b.nombre);
      if (la !== undefined && lb !== undefined) return la - lb;
      if (la !== undefined) return -1;
      if (lb !== undefined) return 1;
      return comparar(a.nombre, b.nombre);
    });
}

type Ordenable = { name: string; price: number; createdAt?: number | null };

/** Una copia ordenada; con el mismo precio o fecha, por nombre. */
export function ordenarItems<T extends Ordenable>(items: T[], orden: OrdenCatalogo = "nombre"): T[] {
  const porNombre = (a: T, b: T) => comparar(a.name, b.name);
  return [...items].sort((a, b) => {
    if (orden === "precio-menor") return a.price - b.price || porNombre(a, b);
    if (orden === "precio-mayor") return b.price - a.price || porNombre(a, b);
    if (orden === "recientes") return (b.createdAt ?? 0) - (a.createdAt ?? 0) || porNombre(a, b);
    return porNombre(a, b);
  });
}

/** Los productos agrupados por categoria, en el orden de categoriasConCantidad. */
export function agruparPorCategoria<T extends Ordenable & { category: string }>(
  items: T[],
  orden: OrdenCatalogo = "nombre",
  ordenPropio: string[] = []
): { nombre: string; items: T[] }[] {
  const ordenados = ordenarItems(items, orden);
  return categoriasConCantidad(items, ordenPropio).map(({ nombre }) => ({
    nombre,
    items: ordenados.filter((i) => nombreCategoria(i.category) === nombre),
  }));
}

/** Lo que queda al elegir una categoria ("" es todas) y escribir una busqueda. */
export function filtrarCatalogo<T extends { category: string }>(
  items: T[],
  categoria: string,
  busqueda: string,
  textos: (item: T) => (string | null | undefined)[]
): T[] {
  return items.filter(
    (i) => (!categoria || nombreCategoria(i.category) === categoria) && coincideBusqueda(textos(i), busqueda)
  );
}
