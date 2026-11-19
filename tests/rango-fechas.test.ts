import { describe, expect, it } from "vitest";
import { rangoDeFechas } from "../src/lib/rango-fechas";

/** El "desde / hasta" de Gastos (lo pidio Chopo Snacks). */
describe("rango de fechas", () => {
  it("sin fechas no hay rango: se ve el dia, como siempre", () => {
    expect(rangoDeFechas()).toBeNull();
    expect(rangoDeFechas("", "no-es-fecha")).toBeNull();
  });

  it("desde y hasta, de varios días", () => {
    expect(rangoDeFechas("2026-11-01", "2026-11-16")).toEqual({ desde: "2026-11-01", hasta: "2026-11-16", varios: true });
  });

  it("el mismo día o una sola fecha es ese día", () => {
    expect(rangoDeFechas("2026-11-16", "2026-11-16")).toEqual({ desde: "2026-11-16", hasta: "2026-11-16", varios: false });
    expect(rangoDeFechas("2026-11-10", null)).toEqual({ desde: "2026-11-10", hasta: "2026-11-10", varios: false });
    expect(rangoDeFechas(undefined, "2026-11-12")?.desde).toBe("2026-11-12");
  });

  it("al revés se da vuelta", () => {
    expect(rangoDeFechas("2026-11-16", "2026-11-01")).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-16" });
  });

  it("más de un año se queda con el último año", () => {
    expect(rangoDeFechas("2020-01-01", "2026-11-16")).toMatchObject({ desde: "2025-11-16", hasta: "2026-11-16" });
  });
});
