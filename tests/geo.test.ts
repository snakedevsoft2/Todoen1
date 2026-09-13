import { describe, expect, it } from "vitest";
import { distanciaM, enElSitio, prettyDistancia } from "../src/lib/geo";

/**
 * Las distancias que deciden si alguien marco "en el sitio" o "lejos".
 *
 * Un error aqui no rompe nada visible: simplemente senala como lejos a quien
 * estaba en su puesto, o deja pasar a quien marco desde la casa. Por eso se
 * fijan contra distancias conocidas y no contra lo que devuelva la formula.
 */

describe("distancia entre coordenadas", () => {
  it("el mismo punto esta a cero metros", () => {
    expect(distanciaM(4.65, -74.058, 4.65, -74.058)).toBe(0);
  });

  it("un grado de latitud son unos 111 km", () => {
    const d = distanciaM(4, -74, 5, -74);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("veinte metros al norte dan unos veinte metros", () => {
    // 0.00018 grados de latitud son cerca de 20 metros.
    const d = distanciaM(4.65, -74.058, 4.65018, -74.058);
    expect(d).toBeGreaterThan(18);
    expect(d).toBeLessThan(22);
  });

  it("es la misma ida que vuelta", () => {
    const a = distanciaM(4.65, -74.058, 4.55, -74.1);
    const b = distanciaM(4.55, -74.1, 4.65, -74.058);
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });

  it("Bogota a Medellin da unos 240 km en linea recta", () => {
    const d = distanciaM(4.711, -74.0721, 6.2442, -75.5812);
    expect(d / 1000).toBeGreaterThan(230);
    expect(d / 1000).toBeLessThan(250);
  });
});

describe("si cuenta como marcado en el sitio", () => {
  it("dentro del radio esta en el sitio", () => {
    expect(enElSitio(100, 150, 10)).toBe(true);
  });

  it("fuera del radio esta lejos", () => {
    expect(enElSitio(2400, 150, 10)).toBe(false);
  });

  it("la imprecision del GPS se le suma al radio, no se le cobra a la persona", () => {
    // Radio 100, a 150 metros, pero el telefono dice +-80: puede estar adentro.
    expect(enElSitio(150, 100, 80)).toBe(true);
    // Sin ese margen, lo mismo quedaria afuera.
    expect(enElSitio(150, 100, 0)).toBe(false);
  });

  it("un GPS con un margen absurdo no abre la puerta a cualquier distancia", () => {
    // Un telefono que dice +-5 km no puede convertir 3 km en "en el sitio".
    expect(enElSitio(3000, 150, 5000)).toBe(false);
  });

  it("sin distancia no se juzga", () => {
    expect(enElSitio(null, 150, 10)).toBeNull();
  });
});

describe("como se muestra la distancia", () => {
  it("metros hasta mil, kilometros despues", () => {
    expect(prettyDistancia(12)).toBe("12 m");
    expect(prettyDistancia(2400)).toBe("2,4 km");
  });

  it("sin ubicacion lo dice", () => {
    expect(prettyDistancia(null)).toBe("sin ubicacion");
  });
});
