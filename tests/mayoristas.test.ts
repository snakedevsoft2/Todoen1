import { describe, expect, it } from "vitest";
import {
  nextTier,
  sortTiers,
  tierForQty,
  tierLabel,
  tierPrice,
  wholesaleTotals,
  type Tier,
} from "../src/lib/wholesale";

/** Las escalas tipicas de una tienda de ropa, a proposito desordenadas. */
const TIERS: Tier[] = [
  { id: "paca", minQty: 12, percentOff: 20, label: "Paca" },
  { id: "media", minQty: 6, percentOff: 10, label: "Media docena" },
  { id: "docena", minQty: 24, percentOff: 25, label: null },
];

describe("escalas al por mayor", () => {
  it("las ordena de la mas chica a la mas grande", () => {
    expect(sortTiers(TIERS).map((t) => t.minQty)).toEqual([6, 12, 24]);
  });

  it("no aplica ninguna escala si el pedido no alcanza la primera", () => {
    expect(tierForQty(TIERS, 5)).toBeNull();
  });

  it("aplica la escala mas alta que el pedido ya alcanzo", () => {
    expect(tierForQty(TIERS, 6)?.id).toBe("media");
    expect(tierForQty(TIERS, 11)?.id).toBe("media");
    expect(tierForQty(TIERS, 12)?.id).toBe("paca");
    expect(tierForQty(TIERS, 500)?.id).toBe("docena");
  });

  it("dice cual es la siguiente escala, para poder decirle cuanto le falta", () => {
    expect(nextTier(TIERS, 1)?.minQty).toBe(6);
    expect(nextTier(TIERS, 6)?.minQty).toBe(12);
    expect(nextTier(TIERS, 24)).toBeNull();
  });

  it("descuenta sobre el precio de la unidad y redondea a pesos enteros", () => {
    expect(tierPrice(30000, 10)).toBe(27000);
    expect(tierPrice(35900, 15)).toBe(30515);
    // Un descuento fuera de rango no puede dejar el precio en negativo.
    expect(tierPrice(10000, 200)).toBe(1000);
    expect(tierPrice(10000, -5)).toBe(10000);
  });

  it("nombra la escala con su etiqueta cuando la tiene", () => {
    expect(tierLabel(TIERS[1], "prendas")).toBe("Media docena - desde 6 prendas");
    expect(tierLabel(TIERS[2], "prendas")).toBe("Desde 24 prendas");
  });
});

describe("cuentas del pedido", () => {
  it("cuenta las unidades de todo el pedido, no las de cada prenda", () => {
    // Tres camisas y tres pantalones: ninguna referencia llega a 6, pero el
    // pedido si. Es el caso del mayorista que surte tallas distintas.
    const lineas = [
      { precio: 30000, qty: 3 },
      { precio: 50000, qty: 3 },
    ];
    const cuentas = wholesaleTotals(lineas, TIERS);
    expect(cuentas.units).toBe(6);
    expect(cuentas.tier?.id).toBe("media");
    expect(cuentas.full).toBe(240000);
    expect(cuentas.total).toBe(216000);
    expect(cuentas.saved).toBe(24000);
  });

  it("deja el pedido intacto si no alcanza ninguna escala", () => {
    const cuentas = wholesaleTotals([{ precio: 30000, qty: 2 }], TIERS);
    expect(cuentas.tier).toBeNull();
    expect(cuentas.total).toBe(60000);
    expect(cuentas.saved).toBe(0);
    expect(cuentas.next?.minQty).toBe(6);
    expect(cuentas.missing).toBe(4);
  });

  it("sin escalas configuradas cobra el precio de siempre", () => {
    const cuentas = wholesaleTotals([{ precio: 30000, qty: 40 }], []);
    expect(cuentas.tier).toBeNull();
    expect(cuentas.total).toBe(1200000);
    expect(cuentas.missing).toBe(0);
  });

  it("el total es exactamente la suma de los renglones que ve el cliente", () => {
    // Precios feos a proposito: si se redondeara una sola vez al final, el
    // total no cuadraria con lo que suma renglon por renglon.
    const lineas = [
      { precio: 35900, qty: 7 },
      { precio: 19990, qty: 6 },
    ];
    const cuentas = wholesaleTotals(lineas, TIERS);
    const aMano =
      tierPrice(35900, cuentas.tier!.percentOff) * 7 + tierPrice(19990, cuentas.tier!.percentOff) * 6;
    expect(cuentas.tier?.id).toBe("paca");
    expect(cuentas.total).toBe(aMano);
  });

  it("un pedido vacio no rompe las cuentas", () => {
    const cuentas = wholesaleTotals([], TIERS);
    expect(cuentas.units).toBe(0);
    expect(cuentas.total).toBe(0);
    expect(cuentas.next?.minQty).toBe(6);
  });
});
