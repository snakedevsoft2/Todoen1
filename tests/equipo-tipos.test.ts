import { describe, expect, it } from "vitest";
import { PRESETS, TIPOS } from "../prisma/modulos";
import { etiquetaDeRol, hasTeam, teamNoun } from "../src/lib/staff";

/**
 * El apartado "Empleados" y la pantalla de empleados tienen que estar de
 * acuerdo.
 *
 * Paso que el catalogo le daba "Empleados" a "Otro negocio" pero la pantalla
 * solo aceptaba barberia, ropa, cartera y asistencia: el menu lo mostraba y al
 * tocarlo volvia al inicio, sin forma de agregar a nadie. Lo que se fija: todo
 * negocio que tenga el apartado en el catalogo (prendido o apagado de
 * fabrica) entra a la pantalla, con el nombre que le da el catalogo.
 */
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

describe("empleados por tipo de negocio", () => {
  const conEquipo = TIPOS.filter((t) => "equipo" in PRESETS[t]);

  it("todo negocio con el apartado en el catálogo puede abrir la pantalla", () => {
    expect(conEquipo).toContain("OTRO");
    for (const tipo of conEquipo) expect(hasTeam(tipo), tipo).toBe(true);
  });

  it("la pantalla se llama igual que en el menú", () => {
    for (const tipo of conEquipo) {
      const label = PRESETS[tipo].equipo.label;
      if (label) expect(sinTildes(teamNoun(tipo).title), tipo).toBe(sinTildes(label));
    }
  });

  it("solo la barbería crea barberos; los demás, empleados", () => {
    for (const tipo of conEquipo) expect(teamNoun(tipo).role, tipo).toBe(tipo === "BARBERIA" ? "BARBERO" : "VENDEDOR");
    expect(teamNoun("NUEVO_TIPO").singular).toBe("empleado");
    expect(etiquetaDeRol("VENDEDOR", "OTRO")).toBe("Empleado");
  });

  it("el negocio sin el apartado no lo abre", () => {
    const sinEquipo = TIPOS.filter((t) => !("equipo" in PRESETS[t]));
    for (const tipo of sinEquipo) expect(hasTeam(tipo), tipo).toBe(false);
  });
});
