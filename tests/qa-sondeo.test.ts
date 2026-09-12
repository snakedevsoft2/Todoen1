import { describe, expect, it } from "vitest";
import { planDeCuotas, valorCuota, estadoPrestamo } from "../src/lib/prestamos";
import { parseMoney, money, aCampo } from "../src/lib/format";

/** Sondeo de QA: se busca donde se rompe, no donde funciona. */
describe("QA prestamos: bordes", () => {
  it("plan con una sola cuota", () => {
    const p = planDeCuotas({ total: 100000, cuotas: 1, frecuencia: "MENSUAL", desde: "2026-01-01" });
    console.log("1 cuota ->", JSON.stringify(p));
    expect(p).toHaveLength(1);
  });

  it("SOSPECHA: redondeo hacia arriba puede acortar el plan", () => {
    // 100 pesos en 20 cuotas: la cuota redondeada a la decena es 10, y 10
    // cuotas de 10 ya cubren el total. Quedarian 10 cuotas y no 20.
    const p = planDeCuotas({ total: 100, cuotas: 20, frecuencia: "DIARIA", desde: "2026-01-01" });
    console.log("pedidas 20, salieron", p.length, "->", JSON.stringify(p.map((c) => c.monto)));
    expect(p.length).toBe(20);
  });

  it("cuotas mas que el total en centavos", () => {
    const p = planDeCuotas({ total: 5, cuotas: 10, frecuencia: "DIARIA", desde: "2026-01-01" });
    console.log("total 5 en 10 cuotas ->", JSON.stringify(p.map((c) => c.monto)));
    expect(p.reduce((s, c) => s + c.monto, 0)).toBe(5);
  });

  it("valorCuota con total muy pequeno", () => {
    console.log("valorCuota(1, 20) =", valorCuota(1, 20));
    expect(valorCuota(1, 20)).toBeLessThanOrEqual(10);
  });

  it("estado con plan vacio no revienta", () => {
    const e = estadoPrestamo([], 0, "2026-01-01");
    expect(e.atraso).toBe(0);
    expect(e.proxima).toBeNull();
  });
});

describe("QA dinero: entradas hostiles", () => {
  it("SOSPECHA: acepta negativos", () => {
    const n = parseMoney("-5000", "COP");
    console.log("parseMoney('-5000') =", n);
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it("numero gigante", () => {
    const n = parseMoney("999999999999999999", "COP");
    console.log("gigante =", n, "seguro?", Number.isSafeInteger(n));
    expect(Number.isSafeInteger(n)).toBe(true);
  });

  it("varios separadores raros", () => {
    console.log("1.2.3 USD =", parseMoney("1.2.3", "USD"));
    console.log("'..' USD =", parseMoney("..", "USD"));
    console.log("'-' COP =", parseMoney("-", "COP"));
    expect(parseMoney("..", "USD")).toBe(0);
  });

  it("ida y vuelta con muchos decimales", () => {
    const n = parseMoney("0.999", "USD");
    console.log("0.999 USD ->", n, "->", aCampo(n, "USD"), money(n, "USD"));
    expect(n).toBe(100); // 0,999 se redondea a un dolar, no a 999
  });
});
