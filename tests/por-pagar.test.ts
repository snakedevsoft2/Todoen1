import { describe, expect, it } from "vitest";
import {
  estadoDe,
  gananciaDe,
  leerCifra,
  puedeVerPorPagar,
  subtotalDe,
  totalDe,
  totalVentaDe,
} from "../src/lib/por-pagar";

/**
 * Cuentas por pagar de Chopo Snacks: quien lo ve, y que las cuentas den lo
 * mismo que en su hoja de Excel.
 */
const chopo = { businessName: "Chopo Snacks" };

describe("quién ve Cuentas por pagar", () => {
  it("Juliana Intriago en Chopo Snacks, entre como dueña o como empleada", () => {
    expect(puedeVerPorPagar(chopo, { name: "Juliana Intriago" })).toBe(true);
    expect(puedeVerPorPagar(chopo, { name: "JULIANA INTRIAGO" })).toBe(true);
    expect(puedeVerPorPagar(chopo, { name: "Haydi Juliana Intriago Anchundia" })).toBe(true);
    expect(puedeVerPorPagar({ businessName: "CHOPO SNACKS" }, { name: "juliana intriago" })).toBe(true);
  });

  it("nadie más de la cuenta", () => {
    expect(puedeVerPorPagar(chopo, { name: "Juliana" })).toBe(false);
    expect(puedeVerPorPagar(chopo, { name: "Javier" })).toBe(false);
    expect(puedeVerPorPagar(chopo, { name: "LUIS ANDRIMBA" })).toBe(false);
  });

  it("ni una Juliana Intriago desactivada, ni la de otro negocio", () => {
    expect(puedeVerPorPagar(chopo, { name: "Juliana Intriago", active: false })).toBe(false);
    expect(puedeVerPorPagar({ businessName: "Tienda Prueba" }, { name: "Juliana Intriago" })).toBe(false);
    expect(puedeVerPorPagar({ businessName: "Chopo Snacks 2" }, { name: "Juliana Intriago" })).toBe(false);
  });
});

describe("leer lo que se escribe", () => {
  it("con coma o con punto, y con muchos decimales", () => {
    expect(leerCifra("1,5217")).toBe(1.5217);
    expect(leerCifra("1.5217")).toBe(1.5217);
    expect(leerCifra("98,5")).toBe(98.5);
    expect(leerCifra("0,0284")).toBe(0.0284);
    expect(leerCifra("US$ 3,25")).toBe(3.25);
    expect(leerCifra("1.234,56")).toBe(1234.56);
    expect(leerCifra("1,234.56")).toBe(1234.56);
  });

  it("sin numero no inventa un cero", () => {
    expect(leerCifra("")).toBeNaN();
    expect(leerCifra("abc")).toBeNaN();
  });
});

const r = (qty: number, unitPrice: number, discount = 0, salePrice: number | null = null) => ({
  qty,
  unitPrice,
  discount,
  salePrice,
});

describe("las cuentas de la hoja", () => {
  it("IMDAKA: costo, venta y ganancia", () => {
    // 20/08/2026 de la hoja de IMDAKA: 13 renglones de 10 y uno de 20.
    const compra = [
      ...[1.7, 1.7, 1.7, 1.8, 1.8, 1.7, 1.7, 1.8, 1.8, 1.8].map((p) => r(10, p, 0, 2)),
      r(20, 1.7, 0, 2),
      r(10, 1.7, 0, 2),
      r(10, 1.7, 0, 2),
      r(10, 1.7, 0, 2),
    ];
    expect(totalDe(compra)).toBe(260);
    expect(totalVentaDe(compra)).toBe(300);
    expect(gananciaDe(compra)).toBe(40);
  });

  it("MARCSEAL: el descuento se resta del subtotal y el IVA va encima", () => {
    const compra = [r(2, 14.06, 10.74), r(2, 17.18, 8.85), r(1, 21.09, 6.31)];
    expect(subtotalDe(compra[0])).toBe(17.38);
    expect(totalDe(compra)).toBe(57.67);
    // En la hoja dice 66,3.
    expect(Math.round(totalDe(compra, 15) * 10) / 10).toBe(66.3);
  });

  it("SERVIFLEX y SURTIANDINO: con IVA y con regalos a cero", () => {
    expect(Math.round(totalDe([r(3000, 0.0284)], 15) * 10) / 10).toBe(98);
    const surti = [r(8, 0), r(84, 0.78), r(84, 0.78), r(84, 0.78), r(5, 0.51)];
    expect(Math.round(totalDe(surti, 15) * 10) / 10).toBe(229);
  });

  it("la ganancia descuenta el IVA de lo que costó", () => {
    expect(gananciaDe([r(10, 1, 0, 2)], 15)).toBe(8.5);
  });

  it("precios de cuatro decimales sin errores de redondeo", () => {
    expect(subtotalDe(r(30, 1.5217))).toBe(45.651);
    expect(subtotalDe(r(3000, 0.0284))).toBe(85.2);
    expect(totalDe([r(0.1, 1), r(0.2, 1)])).toBe(0.3);
  });

  it("sin precio de venta no hay ganancia que mostrar", () => {
    expect(totalVentaDe([r(10, 1.7)])).toBeNull();
    expect(gananciaDe([r(10, 1.7)])).toBeNull();
  });

  it("cancelado es pagado del todo", () => {
    expect(estadoDe(100, 100)).toBe("CANCELADO");
    expect(estadoDe(100, 99.99)).toBe("PENDIENTE");
    expect(estadoDe(100, 0)).toBe("PENDIENTE");
    expect(estadoDe(0, 0)).toBe("CANCELADO");
  });
});
