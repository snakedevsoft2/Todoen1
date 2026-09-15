import { describe, expect, it } from "vitest";
import { fondoValido, resolverFondo } from "../src/lib/fondos";

/**
 * El fondo del portafolio con un color elegido a mano.
 *
 * Lo que se fija: que se acepte un color de verdad y no cualquier texto, que el
 * texto de encima vaya en blanco sobre un color oscuro y en negro sobre uno
 * claro, y que lo que no sirva caiga al fondo clasico.
 */
describe("fondo del portafolio con un color libre", () => {
  it("acepta un color elegido a mano y decide el color del texto", () => {
    expect(fondoValido("color:#1f7a4d")).toBe(true);
    expect(fondoValido("color:rojo")).toBe(false);
    expect(fondoValido("menta")).toBe(true);
    expect(resolverFondo("color:#1F7A4D", "#5856d6", null)).toMatchObject({ key: "libre", enTarjeta: true, color: "#1f7a4d", oscuro: true });
    expect(resolverFondo("color:#fff4d6", "#5856d6", null)).toMatchObject({ color: "#fff4d6", oscuro: false });
  });

  it("lo que no es válido cae al fondo clásico", () => {
    expect(resolverFondo("color:javascript", "#5856d6", null).key).toBe("claro");
    expect(resolverFondo(null, "#5856d6", null).key).toBe("claro");
  });
});
