import { normalizar } from "./orden-productos";

/**
 * Organizar MB NAILS SPA desde su propia cuenta (ver lib/mb-nails.ts).
 *
 * Primero se intento con migraciones que buscaban la cuenta por el nombre, y
 * en produccion no hicieron nada (habia mas de una cuenta llamada asi). Por
 * eso ahora lo aplica la dueña con un boton, en SU cuenta, despues de ver el
 * plan: que productos pasan de "General" a su categoria, que les cambia el
 * precio, que falta de sus listas (con casilla, por si ya lo tiene con otro
 * nombre) y que manicuristas se crean.
 *
 * Este archivo no toca la base: arma el plan con lo que le pasan.
 */

export type ItemLista = { name: string; category: string; price: number; description: string | null; bookable: boolean };

const U = "Desde este valor: depende del largo y el decorado. Para el precio exacto, envía foto del decorado.";
const C = "Desde este valor: depende del largo y lo abundante del cabello. Para el precio exacto, envía foto del cabello.";
const servicio = (name: string, category: string, price: number, description: string | null = null): ItemLista => ({
  name,
  category,
  price,
  description,
  bookable: true,
});
const producto = (name: string, category: string, price: number): ItemLista => ({ name, category, price, description: null, bookable: false });

/** Su "Listado de precios 2026" y su lista de mecato, en pesos. */
export const LISTA_MB: ItemLista[] = [
  servicio("Tradicional (manos o pies)", "Uñas", 25000, U),
  servicio("Limpieza (manos o pies)", "Uñas", 15000, U),
  servicio("Semi (manos o pies)", "Uñas", 45000, U),
  servicio("Base Rubber", "Uñas", 60000, U),
  servicio("Dipping", "Uñas", 75000, U),
  servicio("Press On", "Uñas", 85000, U),
  servicio("Builder Gel", "Uñas", 80000, U),
  servicio("Montaje Polygel", "Uñas", 90000, U),
  servicio("Retoque Polygel", "Uñas", 80000, U),
  servicio("Montaje Acrílico", "Uñas", 90000, U),
  servicio("Retoque Acrílico", "Uñas", 80000, U),
  servicio("Cejas con henna", "Depilación con cera", 30000),
  servicio("Cejas", "Depilación con cera", 15000),
  servicio("Cejas con cuchilla", "Depilación con cera", 5000),
  servicio("Bozo", "Depilación con cera", 10000),
  servicio("Mentón", "Depilación con cera", 8000),
  servicio("Axilas", "Depilación con cera", 20000),
  servicio("Brazos", "Depilación con cera", 35000),
  servicio("Media pierna", "Depilación con cera", 40000),
  servicio("Pierna completa", "Depilación con cera", 55000),
  servicio("Pestañas", "Pestañas", 30000, "Entre $30.000 y $35.000."),
  servicio("Hidratación", "Capilares", 60000, C),
  servicio("Nutrición", "Capilares", 60000, C),
  servicio("Reconstrucción", "Capilares", 80000, C),
  servicio("Terapia capilar", "Capilares", 70000, C),
  producto("Coca Cola 400ml", "Bebidas", 3500),
  producto("Soda Bretaña", "Bebidas", 3000),
  producto("Vive 100", "Bebidas", 4500),
  producto("Gatorade", "Bebidas", 4500),
  producto("Jugo Hit 500ml", "Bebidas", 3500),
  producto("Pepsi 400ml", "Bebidas", 3500),
  producto("Manzana 400ml", "Bebidas", 3500),
  producto("Uva 400ml", "Bebidas", 3500),
  producto("Colombiana 400ml", "Bebidas", 3500),
  producto("Seven Up 400ml", "Bebidas", 3500),
  producto("Naranja 400ml", "Bebidas", 3500),
  producto("Manzana 250ml", "Bebidas", 2000),
  producto("Uva 250ml", "Bebidas", 2000),
  producto("Colombiana 250ml", "Bebidas", 2000),
  producto("Speed Max 250ml", "Bebidas", 2500),
  producto("Agua con gas 250ml", "Bebidas", 1000),
  producto("Chokis", "Mecato", 2000),
  producto("Mas Picadota", "Mecato", 1500),
  producto("Rosquillas", "Mecato", 1500),
  producto("Papas rizadas", "Mecato", 2600),
  producto("Palomitas", "Mecato", 2500),
  producto("Tozineta", "Mecato", 2500),
  producto("Yupi Gigante", "Mecato", 2000),
  producto("Cheese Tris", "Mecato", 2300),
  producto("Maní", "Mecato", 1000),
];

/** El orden en que salen las categorias. */
export const CATEGORIAS_MB = ["Uñas", "Depilación con cera", "Pestañas", "Capilares", "Bebidas", "Mecato"];

/** Sus 5 manicuristas, con el usuario con que entran (sin clave, como todo empleado). */
export const MANICURISTAS_MB = [
  { name: "Jessica Gaitan", username: "jessica.mbnails", color: "#e11d48" },
  { name: "Paola Meléndez", username: "paola.mbnails", color: "#a855f7" },
  { name: "Natalia Rincon", username: "natalia.mbnails", color: "#0ea5e9" },
  { name: "Génesis Carpio", username: "genesis.mbnails", color: "#f97316" },
  { name: "Karen Botero", username: "karen.mbnails", color: "#16a34a" },
];

/**
 * La categoria de un producto por su nombre, con palabras que no se cruzan:
 * se mira por palabras enteras o su comienzo ("pierna" no es "pie"). Lo que
 * no se reconoce devuelve null y se queda donde esta.
 */
const REGLAS: [string, (palabras: string[], todo: string) => boolean][] = [
  ["Pestañas", (p) => p.some((w) => w.startsWith("pestan"))],
  ["Depilación con cera", (p) => p.some((w) => ["ceja", "cejas", "bozo", "menton", "axila", "axilas", "brazo", "brazos", "pierna", "piernas", "bigote", "depilacion", "cera", "cuchilla", "henna"].includes(w))],
  ["Capilares", (p) => p.some((w) => /^(hidrata|nutri|reconstru|capilar|cabello|keratina|alisado|cepillado)/.test(w))],
  [
    "Bebidas",
    (p, t) =>
      /\b(coca|pepsi|soda|gatorade|jugo|hit|gaseosa|agua|speed|colombiana|naranja|limonada|bretana|vive ?100|seven ?up|7 ?up)\b/.test(t) ||
      (p.some((w) => w === "manzana" || w === "uva") && /\d+ ?ml\b/.test(t)),
  ],
  ["Mecato", (p) => p.some((w) => /^(chokis|picadota|rosquilla|papas|papa|palomita|tozineta|yupi|cheese|mani|galleta|chocolat|chicle|dulce|mecato|snack)/.test(w))],
  [
    "Uñas",
    (p) =>
      p.some((w) => /^(una|unas|esmalt|semi|semipermanente|acril|polygel|gel|dipping|rubber|builder|manicur|pedicur|tradicional|limpieza|decorad|retoque|montaje|press)/.test(w)),
  ],
];

export function categoriaPorNombre(nombre: string): string | null {
  const todo = normalizar(nombre);
  const palabras = todo.split(" ").filter(Boolean);
  for (const [categoria, cumple] of REGLAS) if (cumple(palabras, todo)) return categoria;
  return null;
}

export type ProductoExistente = { id: string; name: string; price: number; category: string };

export type PlanOrganizar = {
  /** De "General" a su categoria. */
  mover: { id: string; name: string; a: string }[];
  /** Mismo nombre que en la lista, otro precio. */
  precios: { id: string; name: string; de: number; a: number }[];
  /** Lo de la lista que no tiene; `parecido` si ya tiene algo de la misma categoria y precio. */
  faltan: { item: ItemLista; parecido: string | null }[];
};

const esGeneral = (c: string) => normalizar(c) === "general" || c.trim() === "";

export function planDeOrganizar(existentes: ProductoExistente[]): PlanOrganizar {
  const porNombre = new Map(existentes.map((p) => [normalizar(p.name), p]));
  const enLista = new Map(LISTA_MB.map((i) => [normalizar(i.name), i]));

  const mover: PlanOrganizar["mover"] = [];
  // La categoria que va a quedar, para buscar parecidos.
  const quedaEn = new Map<string, string>();
  for (const p of existentes) {
    const deLista = enLista.get(normalizar(p.name));
    const a = esGeneral(p.category) ? (deLista?.category ?? categoriaPorNombre(p.name)) : null;
    if (a) mover.push({ id: p.id, name: p.name, a });
    quedaEn.set(p.id, a ?? p.category);
  }

  const precios: PlanOrganizar["precios"] = [];
  const faltan: PlanOrganizar["faltan"] = [];
  for (const item of LISTA_MB) {
    const ya = porNombre.get(normalizar(item.name));
    if (ya) {
      if (ya.price !== item.price) precios.push({ id: ya.id, name: ya.name, de: ya.price, a: item.price });
      continue;
    }
    // Algo de la misma categoria y el mismo precio que no se llama igual:
    // seguro es lo mismo escrito distinto ("ESMALTADO SEMIPERMANENTE MANOS").
    const parecido = existentes.find(
      (p) =>
        p.price === item.price &&
        normalizar(quedaEn.get(p.id) ?? p.category) === normalizar(item.category) &&
        !enLista.has(normalizar(p.name))
    );
    faltan.push({ item, parecido: parecido?.name ?? null });
  }
  return { mover, precios, faltan };
}
