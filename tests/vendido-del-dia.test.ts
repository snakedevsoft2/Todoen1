import { describe, expect, it } from "vitest";
import { productosDelFiado, vendidoDelDia } from "../src/lib/vendido-del-dia";
import { normalizar } from "../src/lib/orden-productos";

const precios = new Map(
  [
    ["Papa natural grande", 90],
    ["Chicharrón grande", 90],
    ["Mixto", 90],
    ["Gomas", 50],
  ].map(([n, p]) => [normalizar(n as string), p as number])
);

/** Lo vendido en el día en Ventas de Chopo Snacks: contado + fiado, abonos aparte. */
describe("lo vendido en el día con los fiados", () => {
  it("suma los fiados al total y deja los abonos aparte", () => {
    const r = vendidoDelDia(
      [
        { origin: "MANUAL", total: 450, items: [{ name: "Papa natural grande", qty: 5, unitPrice: 90 }] },
        // El abono de un fiado: plata que entra, no un producto vendido.
        {
          origin: "CARTERA",
          total: 5325,
          items: [{ name: "Abono - 10x Papa natural grande, 3x Chicharrón grande, 1x Gomas", qty: 1, unitPrice: 5325 }],
        },
      ],
      [{ concept: "10x Papa natural grande, 2x Mixto", amount: 1080, alreadyInvoiced: false }],
      precios
    );
    expect(r).toMatchObject({ total: 1530, contado: 450, fiado: 1080, abonos: 5325, movimientos: 2 });
    expect(r.productos).toEqual([
      { name: "Papa natural grande", qty: 15, total: 1350 },
      { name: "Mixto", qty: 2, total: 180 },
    ]);
    expect(r.productos.some((p) => p.name.startsWith("Abono"))).toBe(false);
  });

  it("el fiado que ya se registró en Ventas no se cuenta dos veces", () => {
    const r = vendidoDelDia(
      [{ origin: "MANUAL", total: 180, items: [{ name: "Mixto", qty: 2, unitPrice: 90 }] }],
      [{ concept: "2x Mixto", amount: 180, alreadyInvoiced: true }],
      precios
    );
    expect(r).toMatchObject({ total: 180, fiado: 0, movimientos: 1 });
    expect(r.productos).toEqual([{ name: "Mixto", qty: 2, total: 180 }]);
  });

  it("junta el mismo producto escrito distinto", () => {
    const r = vendidoDelDia(
      [{ origin: "MANUAL", total: 90, items: [{ name: "Chicharrón grande", qty: 1, unitPrice: 90 }] }],
      [{ concept: "3x chicharron grande", amount: 270, alreadyInvoiced: false }],
      precios
    );
    expect(r.productos).toEqual([{ name: "Chicharrón grande", qty: 4, total: 360 }]);
  });

  it("un fiado escrito a mano suma al total aunque no tenga productos", () => {
    const r = vendidoDelDia([], [{ concept: "Registro de notas en el sistema", amount: 1000, alreadyInvoiced: false }], precios);
    expect(r).toMatchObject({ total: 1000, fiado: 1000, movimientos: 1 });
    expect(r.productos).toEqual([]);
  });
});

describe("el valor de cada producto de un fiado", () => {
  it("reparte el valor según el precio del catálogo y la suma da exacto", () => {
    // El catálogo da 1000 (10 × 90 + 2 × 50), pero se fio por 1001.
    const p = productosDelFiado({ concept: "10x Papa natural grande, 2x Gomas", amount: 1001 }, precios);
    expect(p.map((x) => x.qty)).toEqual([10, 2]);
    expect(p.reduce((s, x) => s + x.total, 0)).toBe(1001);
    expect(p[0].total).toBe(901);
  });

  it("al producto que ya no está en el catálogo le toca el precio promedio", () => {
    const p = productosDelFiado({ concept: "1x Mixto, 1x Producto borrado", amount: 180 }, precios);
    expect(p).toEqual([
      { name: "Mixto", qty: 1, total: 90 },
      { name: "Producto borrado", qty: 1, total: 90 },
    ]);
  });

  it("sin ningún precio conocido reparte por cantidad", () => {
    const p = productosDelFiado({ concept: "3x Uno, 1x Otro", amount: 400 }, new Map());
    expect(p).toEqual([
      { name: "Uno", qty: 3, total: 300 },
      { name: "Otro", qty: 1, total: 100 },
    ]);
  });
});
