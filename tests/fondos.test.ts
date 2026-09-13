import { describe, expect, it } from "vitest";
import { esFondo, FONDOS, resolverFondo } from "../src/lib/fondos";

/**
 * Los fondos del portafolio.
 *
 * Lo que se fija aqui es que ninguna combinacion deje la pagina en blanco o
 * rota: un valor inventado, "Mi portada" sin portada, un color de marca mal
 * guardado.
 */

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("resolver el fondo", () => {
  it("clasico no pone tarjeta: es la pagina de siempre", () => {
    const f = resolverFondo("claro", "#0f766e", PNG);
    expect(f.enTarjeta).toBe(false);
    expect(f.foto).toBeNull();
  });

  it("un color de la lista pone tarjeta sobre ese color", () => {
    const f = resolverFondo("arena", "#0f766e", null);
    expect(f.enTarjeta).toBe(true);
    expect(f.color).toBe("#f4ede3");
    expect(f.oscuro).toBe(false);
  });

  it("noche es oscuro", () => {
    expect(resolverFondo("oscuro", "#0f766e", null).oscuro).toBe(true);
  });

  it("mi color usa el color del negocio", () => {
    const f = resolverFondo("marca", "#be123c", null);
    expect(f.color).toBe("#be123c");
    expect(f.enTarjeta).toBe(true);
  });

  it("mi portada con portada la pone de fondo", () => {
    const f = resolverFondo("foto", "#0f766e", PNG);
    expect(f.key).toBe("foto");
    expect(f.foto).toBe(PNG);
  });

  it("mi portada SIN portada cae a mi color, no a una pagina en blanco", () => {
    const f = resolverFondo("foto", "#0f766e", null);
    expect(f.key).toBe("marca");
    expect(f.color).toBe("#0f766e");
    expect(f.foto).toBeNull();
  });

  it("un valor inventado deja la pagina clasica", () => {
    expect(resolverFondo("rosado-chillon", "#0f766e", null).key).toBe("claro");
    expect(resolverFondo(null, "#0f766e", null).key).toBe("claro");
  });

  it("un color de marca mal guardado no rompe mi color", () => {
    expect(resolverFondo("marca", "rojo", null).color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("la lista", () => {
  it("todas las llaves son validas y no se repiten", () => {
    const llaves = FONDOS.map((f) => f.key);
    expect(new Set(llaves).size).toBe(llaves.length);
    llaves.forEach((k) => expect(esFondo(k)).toBe(true));
    expect(esFondo("nada")).toBe(false);
  });
});
