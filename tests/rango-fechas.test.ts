import { describe, expect, it } from "vitest";
import { atajosDeRango, diasDelCalendario, mesVecino, rangoDeFechas, tocarDia } from "../src/lib/rango-fechas";

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

/** El calendario de rango: se toca el dia desde y luego el dia hasta. */
describe("calendario de rango", () => {
  it("primer toque desde, segundo hasta; con los dos puestos, empieza de nuevo", () => {
    let e = tocarDia({ desde: null, hasta: null }, "2026-11-03");
    expect(e).toEqual({ desde: "2026-11-03", hasta: null });
    e = tocarDia(e, "2026-11-12");
    expect(e).toEqual({ desde: "2026-11-03", hasta: "2026-11-12" });
    expect(tocarDia(e, "2026-11-20")).toEqual({ desde: "2026-11-20", hasta: null });
  });

  it("si el hasta cae antes del desde, se dan vuelta", () => {
    expect(tocarDia({ desde: "2026-11-12", hasta: null }, "2026-11-03")).toEqual({
      desde: "2026-11-03",
      hasta: "2026-11-12",
    });
  });

  it("el mismo día dos veces es un solo día", () => {
    expect(tocarDia({ desde: "2026-11-12", hasta: null }, "2026-11-12")).toEqual({
      desde: "2026-11-12",
      hasta: "2026-11-12",
    });
  });

  it("el mes va de lunes a domingo, seis semanas", () => {
    const dias = diasDelCalendario("2026-11");
    expect(dias).toHaveLength(42);
    // Noviembre de 2026 empieza en domingo: la primera fila arranca el lunes 26 de octubre.
    expect(dias[0]).toBe("2026-10-26");
    expect(dias[6]).toBe("2026-11-01");
    expect(dias[41]).toBe("2026-12-06");
  });

  it("mes anterior y siguiente, cruzando el año", () => {
    expect(mesVecino("2026-01", -1)).toBe("2025-12");
    expect(mesVecino("2026-12", 1)).toBe("2027-01");
    expect(mesVecino("2026-11", 0)).toBe("2026-11");
  });

  it("atajos: últimos 7 días, este mes y mes pasado", () => {
    expect(atajosDeRango("2026-03-18")).toEqual([
      { nombre: "Últimos 7 días", desde: "2026-03-12", hasta: "2026-03-18" },
      { nombre: "Este mes", desde: "2026-03-01", hasta: "2026-03-18" },
      { nombre: "Mes pasado", desde: "2026-02-01", hasta: "2026-02-28" },
    ]);
  });
});
