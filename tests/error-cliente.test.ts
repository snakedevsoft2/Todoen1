import { describe, expect, it } from "vitest";
import { esErrorDeVersion } from "../src/lib/error-cliente";

/**
 * Que errores se arreglan volviendo a cargar la pantalla: los de tener abierta
 * una version vieja de la aplicacion despues de publicar una nueva. Los demas
 * no: recargar no los arregla y la persona veria la pantalla parpadear.
 */
describe("errores de version vieja", () => {
  it("reconoce los archivos de codigo que ya no estan", () => {
    expect(esErrorDeVersion(Object.assign(new Error("Loading chunk 4520 failed."), { name: "ChunkLoadError" }))).toBe(true);
    expect(esErrorDeVersion(new Error("Loading CSS chunk 12 failed"))).toBe(true);
    // Safari, al importar un modulo que ya no existe.
    expect(esErrorDeVersion(new TypeError("Importing a module script failed."))).toBe(true);
    expect(esErrorDeVersion(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
  });

  it("reconoce la accion del servidor que cambio de nombre", () => {
    expect(
      esErrorDeVersion(
        new Error('Server Action "7f3a" was not found on the server. This request might be from an older or newer deployment.')
      )
    ).toBe(true);
  });

  it("no confunde un error comun con uno de version", () => {
    expect(esErrorDeVersion(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(esErrorDeVersion(new Error("Load failed"))).toBe(false);
    expect(esErrorDeVersion("algo raro")).toBe(false);
  });
});
