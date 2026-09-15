import { describe, expect, it } from "vitest";
import { indicativoDe, toInternational } from "../src/lib/whatsapp";

/**
 * Los numeros de los clientes, listos para los mensajes automaticos.
 *
 * Paso que un cliente guardado como "300 123 4567" (asi llega de la carga
 * masiva) salia sin indicativo si el negocio no tenia puesto su WhatsApp, y
 * WhatsApp no lo entregaba. Y en Ecuador el indicativo salia mal ("59" en vez
 * de "593"). Lo que se fija: el indicativo sale del WhatsApp del negocio o, si
 * no, de su pais; el 0 local se quita; lo que ya trae indicativo se respeta.
 */
describe("números para mandar por WhatsApp", () => {
  it("un celular sin indicativo toma el del país del negocio", () => {
    expect(toInternational("300 123 4567", null, "America/Bogota")).toBe("573001234567");
    expect(toInternational("3001234567", "", "America/Bogota")).toBe("573001234567");
    expect(toInternational("099 123 4567", null, "America/Guayaquil")).toBe("593991234567");
  });

  it("si el negocio tiene su WhatsApp con indicativo, sale de ahí, también en Ecuador", () => {
    expect(toInternational("3001234567", "573009998877", null)).toBe("573001234567");
    expect(toInternational("0991234567", "593987654321", "America/Bogota")).toBe("593991234567");
    expect(indicativoDe("593987654321", null)).toBe("593");
  });

  it("lo que ya trae indicativo se deja igual", () => {
    expect(toInternational("+57 300 123 4567", null, "America/Guayaquil")).toBe("573001234567");
    expect(toInternational("0057 300 123 4567", null, null)).toBe("573001234567");
  });

  it("lo que no alcanza a ser un número no sirve", () => {
    expect(toInternational("123", null, "America/Bogota")).toBeNull();
    expect(toInternational("", null, "America/Bogota")).toBeNull();
    expect(toInternational(null, null, "America/Bogota")).toBeNull();
  });

  it("sin forma de saber el país, queda el número local", () => {
    expect(toInternational("3001234567", null, null)).toBe("3001234567");
  });
});
