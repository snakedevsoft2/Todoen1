import { describe, expect, it } from "vitest";
import { PAISES, esMonedaValida, esPaisValido, esZonaValida, paisDeZona, zonaParaPais } from "../src/lib/paises";
import { decimalesDe, factorDe, money } from "../src/lib/format";
import { toInternational } from "../src/lib/whatsapp";

/**
 * La aplicacion en cualquier pais.
 *
 * Lo que se fija: que cada pais de la lista tenga una moneda y zonas que
 * existen de verdad y un indicativo; que del celular se reconozca el pais;
 * que las monedas que ya se usaban guarden la plata exactamente igual que antes
 * (cambiar eso dañaria precios y ventas guardados); y que el indicativo de
 * WhatsApp salga bien en otras regiones, tambien en Brasil, donde el celular
 * local tiene 11 digitos.
 */
describe("países", () => {
  it("cada país tiene moneda, zonas e indicativo que existen", () => {
    const vistos = new Set<string>();
    for (const p of PAISES) {
      expect(vistos.has(p.code), "repetido " + p.code).toBe(false);
      vistos.add(p.code);
      expect(esMonedaValida(p.moneda), p.code + " " + p.moneda).toBe(true);
      expect(p.zonas.length, p.code).toBeGreaterThan(0);
      for (const z of p.zonas) expect(esZonaValida(z), p.code + " " + z).toBe(true);
      expect(p.indicativo, p.code).toMatch(/^\d{1,3}$/);
      expect(() => money(12345, p.moneda)).not.toThrow();
    }
    expect(PAISES.length).toBeGreaterThanOrEqual(40);
  });

  it("de la zona sale el país, y el país conserva la zona si es suya", () => {
    expect(paisDeZona("America/Guayaquil")?.code).toBe("EC");
    expect(paisDeZona("America/Cancun")?.code).toBe("MX");
    expect(zonaParaPais("MX", "America/Cancun")).toBe("America/Cancun");
    expect(zonaParaPais("MX", "America/Bogota")).toBe("America/Mexico_City");
    expect(esPaisValido("OTRO")).toBe(true);
    expect(esPaisValido("XX")).toBe(false);
    expect(esZonaValida("Asia/Tokyo")).toBe(true);
    expect(esZonaValida("Marte/Base")).toBe(false);
    expect(esMonedaValida("usd")).toBe(false);
  });

  it("las monedas que ya se usaban guardan la plata igual que antes", () => {
    const antes = ["COP", "CLP", "USD", "EUR", "MXN", "PEN", "ARS", "DOP", "VES", "GTQ"].map(factorDe);
    expect(antes).toEqual([1, 1, 100, 100, 100, 100, 100, 100, 100, 100]);
    expect(decimalesDe("XOF")).toBe(0);
    expect(money(20000, "COP")).toMatch(/20\.000/);
    expect(money(300, "MXN")).toMatch(/\$\s?3\.00/);
    expect(money(300, "PEN")).toMatch(/S\/\s?3\.00/);
  });

  it("el indicativo de WhatsApp sale del país en otras regiones", () => {
    expect(toInternational("11 91234 5678", null, "America/Sao_Paulo")).toBe("5511912345678");
    expect(toInternational("612 345 678", null, "Europe/Madrid")).toBe("34612345678");
    expect(toInternational("(212) 555-0123", null, "America/New_York")).toBe("12125550123");
    expect(toInternational("1 212 555 0123", null, "America/New_York")).toBe("12125550123");
    expect(toInternational("+57 300 123 4567", null, "America/Mexico_City")).toBe("573001234567");
  });
});
