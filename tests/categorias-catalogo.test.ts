import { describe, expect, it } from "vitest";
import {
  agruparPorCategoria,
  categoriasConCantidad,
  coincideBusqueda,
  filtrarCatalogo,
  ordenarItems,
} from "../src/lib/categorias";

/**
 * Productos por categoria, con busqueda y orden, para no tener que bajar por
 * toda la lista. Lo que se fija: la busqueda no depende de tildes ni del orden
 * de las palabras, "General" queda de ultima, los numeros se ordenan como
 * numeros y el filtro combina categoria y busqueda.
 */
const items = [
  { name: "Camiseta niño", price: 20000, category: "Ropa", createdAt: 3, brand: "Tito" },
  { name: "Jugo de mora", price: 5000, category: "Bebidas", createdAt: 1, brand: null },
  { name: "Agua", price: 2000, category: "Bebidas", createdAt: 5, brand: null },
  { name: "Bolsa", price: 500, category: "General", createdAt: 2, brand: null },
  { name: "Talla 10", price: 1, category: "", createdAt: 4, brand: null },
  { name: "Talla 2", price: 1, category: "Tallas", createdAt: 6, brand: null },
];

describe("categorías del catálogo", () => {
  it("busca sin tildes, sin mayúsculas y en cualquier orden", () => {
    expect(coincideBusqueda(["Camiseta niño", "Tito"], "NINO camis")).toBe(true);
    expect(coincideBusqueda(["Camiseta niño"], "camiseta roja")).toBe(false);
    expect(coincideBusqueda(["Lo que sea"], "   ")).toBe(true);
  });

  it("cuenta las categorías, con General de última y la vacía como General", () => {
    expect(categoriasConCantidad(items)).toEqual([
      { nombre: "Bebidas", cantidad: 2 },
      { nombre: "Ropa", cantidad: 1 },
      { nombre: "Tallas", cantidad: 1 },
      { nombre: "General", cantidad: 2 },
    ]);
  });

  it("ordena por nombre con números naturales, por precio o por los más nuevos", () => {
    const nombres = (l: typeof items) => l.map((i) => i.name);
    expect(nombres(ordenarItems(items)).slice(-2)).toEqual(["Talla 2", "Talla 10"]);
    expect(nombres(ordenarItems(items, "precio-mayor"))[0]).toBe("Camiseta niño");
    expect(nombres(ordenarItems(items, "precio-menor")).slice(0, 2)).toEqual(["Talla 2", "Talla 10"]);
    expect(nombres(ordenarItems(items, "recientes"))[0]).toBe("Talla 2");
    expect(items[0].name).toBe("Camiseta niño");
  });

  it("agrupa y filtra por categoría y búsqueda a la vez", () => {
    const grupos = agruparPorCategoria(items, "precio-menor");
    expect(grupos[0]).toEqual({ nombre: "Bebidas", items: [items[2], items[1]] });
    expect(grupos.at(-1)?.items.map((i) => i.name)).toEqual(["Talla 10", "Bolsa"]);

    const textos = (i: (typeof items)[number]) => [i.name, i.brand, i.category];
    expect(filtrarCatalogo(items, "Bebidas", "", textos)).toHaveLength(2);
    expect(filtrarCatalogo(items, "Bebidas", "mora", textos).map((i) => i.name)).toEqual(["Jugo de mora"]);
    expect(filtrarCatalogo(items, "General", "talla", textos).map((i) => i.name)).toEqual(["Talla 10"]);
    expect(filtrarCatalogo(items, "", "tito", textos).map((i) => i.name)).toEqual(["Camiseta niño"]);
  });
});
