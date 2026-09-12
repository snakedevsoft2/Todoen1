import { describe, expect, it } from "vitest";
import { aCampo, decimalesDe, money, parseMoney, pasoMoneda } from "../src/lib/format";

/**
 * Como se guarda y como se lee la plata.
 *
 * La plata se guarda en la unidad mas pequena de su moneda: en pesos
 * colombianos el peso, en dolares el centavo. Antes se guardaba siempre como
 * entero de unidades enteras, y eso hacia imposible poner un precio de $0.40:
 * el campo no lo dejaba escribir y, si lo dejaba, se guardaba como 0.
 *
 * Estas pruebas fijan las dos mitades, que tienen que ser exactamente
 * contrarias: lo que parseMoney guarda, money lo muestra igual.
 */

describe("cuantos decimales usa cada moneda", () => {
  it("el peso colombiano no tiene centavos en la practica", () => {
    expect(decimalesDe("COP")).toBe(0);
    expect(decimalesDe("CLP")).toBe(0);
  });

  it("el dolar, el euro y el sol si", () => {
    expect(decimalesDe("USD")).toBe(2);
    expect(decimalesDe("EUR")).toBe(2);
    expect(decimalesDe("PEN")).toBe(2);
  });
});

describe("leer lo que escribe la persona", () => {
  it("guarda un precio en dolares como centavos", () => {
    expect(parseMoney("0.40", "USD")).toBe(40);
    expect(parseMoney("0.28", "USD")).toBe(28);
    expect(parseMoney("12.50", "USD")).toBe(1250);
  });

  it("acepta la coma decimal, que es como teclea medio continente", () => {
    expect(parseMoney("0,40", "USD")).toBe(40);
    expect(parseMoney("12,50", "USD")).toBe(1250);
  });

  it("entiende los dos estilos de separador de miles", () => {
    expect(parseMoney("1.234,56", "USD")).toBe(123456);
    expect(parseMoney("1,234.56", "USD")).toBe(123456);
  });

  it("tres cifras despues del separador son miles, no centavos", () => {
    // "1.500" en dolares es mil quinientos, no uno con cinco.
    expect(parseMoney("1.500", "USD")).toBe(150000);
    expect(parseMoney("1,500", "USD")).toBe(150000);
  });

  it("en pesos no se inventa centavos", () => {
    expect(parseMoney("20000", "COP")).toBe(20000);
    expect(parseMoney("20.000", "COP")).toBe(20000);
    expect(parseMoney("20,000", "COP")).toBe(20000);
  });

  it("ignora el simbolo y los espacios", () => {
    expect(parseMoney("$ 20.000", "COP")).toBe(20000);
    expect(parseMoney("$0.40", "USD")).toBe(40);
  });

  it("lo que no es un numero vale cero, no rompe la pantalla", () => {
    expect(parseMoney("", "USD")).toBe(0);
    expect(parseMoney("abc", "USD")).toBe(0);
    expect(parseMoney(null, "USD")).toBe(0);
  });

  it("sin decir la moneda se comporta como pesos, que es lo de antes", () => {
    expect(parseMoney("20000")).toBe(20000);
  });
});

describe("mostrar lo guardado", () => {
  it("40 centavos se ven como 0,40 y no como 40", () => {
    expect(money(40, "USD")).toMatch(/0[.,]40/);
    expect(money(1250, "USD")).toMatch(/12[.,]50/);
  });

  it("en pesos se ve entero", () => {
    expect(money(20000, "COP")).toMatch(/20[.,]000/);
    expect(money(20000, "COP")).not.toMatch(/[.,]00\b/);
  });
});

describe("lo que entra es lo que sale", () => {
  const casos: { texto: string; moneda: string }[] = [
    { texto: "0.40", moneda: "USD" },
    { texto: "0.28", moneda: "USD" },
    { texto: "99.99", moneda: "EUR" },
    { texto: "1.05", moneda: "PEN" },
    { texto: "20000", moneda: "COP" },
    { texto: "1500", moneda: "CLP" },
  ];

  for (const c of casos) {
    it("guarda y devuelve " + c.texto + " " + c.moneda + " sin perder nada", () => {
      const guardado = parseMoney(c.texto, c.moneda);
      expect(aCampo(guardado, c.moneda)).toBe(
        decimalesDe(c.moneda) === 0 ? c.texto : Number(c.texto).toFixed(2)
      );
    });
  }

  it("sumar centavos no arrastra error, que es para lo que existe el entero", () => {
    const diez = parseMoney("0.10", "USD");
    expect(diez * 3).toBe(30);
    expect(money(diez * 3, "USD")).toMatch(/0[.,]30/);
  });
});

describe("el campo del formulario", () => {
  it("deja teclear centavos solo donde existen", () => {
    expect(pasoMoneda("USD")).toBe("0.01");
    expect(pasoMoneda("COP")).toBe("1");
  });

  it("un valor vacio no pinta cero en el campo", () => {
    expect(aCampo(null, "USD")).toBe("");
    expect(aCampo(undefined, "COP")).toBe("");
  });
});
