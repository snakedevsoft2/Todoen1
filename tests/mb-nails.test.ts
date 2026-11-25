import { describe, expect, it } from "vitest";
import { esManicuristaDeMbNails, esMbNails, rutaDeManicurista } from "../src/lib/mb-nails";
import { CATEGORIAS_MB, LISTA_MB, MANICURISTAS_MB, categoriaPorNombre, planDeOrganizar } from "../src/lib/mb-nails-plan";

describe("quién es manicurista de MB Nails", () => {
  it("reconoce el negocio sin importar mayúsculas ni espacios", () => {
    expect(esMbNails("MB NAILS SPA")).toBe(true);
    expect(esMbNails("  mb nails   spa ")).toBe(true);
    expect(esMbNails("MB Nails Spa Cali")).toBe(false);
    expect(esMbNails("Chopo Snacks")).toBe(false);
  });

  it("solo las empleadas de MB Nails en barbería, no la dueña", () => {
    expect(esManicuristaDeMbNails({ businessName: "MB NAILS SPA", businessType: "BARBERIA" }, { role: "BARBERO" })).toBe(true);
    expect(esManicuristaDeMbNails({ businessName: "MB NAILS SPA", businessType: "BARBERIA" }, { role: "DUENO" })).toBe(false);
    expect(esManicuristaDeMbNails({ businessName: "Barbería El Corte", businessType: "BARBERIA" }, { role: "BARBERO" })).toBe(false);
  });

  it("su menú fijo", () => {
    expect(rutaDeManicurista("/panel/mis-citas")).toBe(true);
    expect(rutaDeManicurista("/panel/perfil")).toBe(true);
    // Ni plata, ni precios, ni clientas: solo sus citas.
    expect(rutaDeManicurista("/panel/precios")).toBe(false);
    expect(rutaDeManicurista("/panel/mecato")).toBe(false);
    expect(rutaDeManicurista("/panel/clientas")).toBe(false);
    expect(rutaDeManicurista("/panel/turnos")).toBe(false);
    expect(rutaDeManicurista("/panel/ventas")).toBe(false);
    expect(rutaDeManicurista("/panel/catalogo")).toBe(false);
  });
});

/** Organizar MB Nails desde la cuenta de la dueña. */
describe("organizar MB Nails", () => {
  it("reconoce la categoría por el nombre, sin cruzar palabras", () => {
    expect(categoriaPorNombre("ESMALTADO SEMIPERMANENTE MANOS")).toBe("Uñas");
    expect(categoriaPorNombre("Pierna completa")).toBe("Depilación con cera");
    expect(categoriaPorNombre("CEJAS CON HENNA")).toBe("Depilación con cera");
    expect(categoriaPorNombre("Pestañas pelo a pelo")).toBe("Pestañas");
    expect(categoriaPorNombre("HIDRATACION CAPILAR")).toBe("Capilares");
    expect(categoriaPorNombre("COCA COLA 400ML")).toBe("Bebidas");
    expect(categoriaPorNombre("MANZANA 250ML")).toBe("Bebidas");
    expect(categoriaPorNombre("PAPAS RIZADAS")).toBe("Mecato");
    expect(categoriaPorNombre("MANI")).toBe("Mecato");
    expect(categoriaPorNombre("Tarjeta de regalo")).toBeNull();
  });

  it("arma el plan: mueve lo de General, corrige precios y marca lo parecido", () => {
    const plan = planDeOrganizar([
      { id: "1", name: "ESMALTADO SEMIPERMANENTE MANOS", price: 45000, category: "UÑAS" },
      { id: "2", name: "COCA COLA 400ML", price: 3000, category: "General" },
      { id: "3", name: "CEJAS", price: 15000, category: "General" },
      { id: "4", name: "Tarjeta de regalo", price: 50000, category: "General" },
    ]);
    expect(plan.mover).toEqual([
      { id: "2", name: "COCA COLA 400ML", a: "Bebidas" },
      { id: "3", name: "CEJAS", a: "Depilación con cera" },
    ]);
    expect(plan.precios).toEqual([{ id: "2", name: "COCA COLA 400ML", de: 3000, a: 3500 }]);
    // 50 de la lista menos Coca Cola y Cejas, que ya estan con ese nombre.
    expect(plan.faltan).toHaveLength(48);
    const semi = plan.faltan.find((f) => f.item.name === "Semi (manos o pies)");
    expect(semi?.parecido).toBe("ESMALTADO SEMIPERMANENTE MANOS");
    expect(plan.faltan.find((f) => f.item.name === "Chokis")?.parecido).toBeNull();
  });

  it("las listas: 25 servicios que se reservan y 25 productos que no", () => {
    expect(LISTA_MB.filter((i) => i.bookable)).toHaveLength(25);
    expect(LISTA_MB.filter((i) => !i.bookable)).toHaveLength(25);
    expect(new Set(LISTA_MB.map((i) => i.category))).toEqual(new Set(CATEGORIAS_MB));
    expect(MANICURISTAS_MB.map((m) => m.username)).toEqual([
      "jessica.mbnails",
      "paola.mbnails",
      "natalia.mbnails",
      "genesis.mbnails",
      "karen.mbnails",
    ]);
  });
});
