import { describe, expect, it } from "vitest";
import { clientesQueCompran, renglonesDeConcepto } from "../src/lib/mejores-clientes";
import { esAdminDeChopo } from "../src/lib/chopo";

/** Cuánto compra cada cliente de Chopo Snacks, para darle promociones. */
describe("cuánto compra cada cliente", () => {
  it("suma ventas y fiados del mismo cliente, aunque lo escriban distinto", () => {
    const r = clientesQueCompran(
      [
        { clientName: "Rosa Vizcaíno", total: 1200, day: "2026-10-01", items: [{ name: "Mixto", qty: 2 }] },
        { clientName: "ROSA VIZCAINO", total: 800, day: "2026-10-03", items: [{ name: "mixto", qty: 1 }] },
        { clientName: "Viveres Carlitos", total: 500, day: "2026-10-02", items: [] },
      ],
      [{ clientName: "rosa vizcaino ", amount: 1000, day: "2026-10-02", concept: "3x Papa natural mediana, 1x Mixto" }]
    );
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ nombre: "ROSA VIZCAINO", compras: 3, total: 3000, contado: 2000, fiado: 1000, ultima: "2026-10-03" });
    expect(r[0].productos[0]).toEqual({ name: "Mixto", qty: 4 });
    expect(r[1].nombre).toBe("Viveres Carlitos");
  });

  it("el mostrador no es un cliente", () => {
    const r = clientesQueCompran(
      [
        { clientName: "Mostrador", total: 900, day: "2026-10-01", items: [] },
        { clientName: "Consumidor final", total: 900, day: "2026-10-01", items: [] },
      ],
      []
    );
    expect(r).toEqual([]);
  });

  it("lee los productos de un fiado anotado desde Ventas", () => {
    expect(renglonesDeConcepto("3x Papa natural mediana, 12x Mixto, Saldo anterior")).toEqual([
      { name: "Papa natural mediana", qty: 3 },
      { name: "Mixto", qty: 12 },
    ]);
  });
});

describe("la administradora de Chopo", () => {
  it("es Juliana Intriago y nadie más", () => {
    expect(esAdminDeChopo({ businessName: "Chopo Snacks" }, { name: "Juliana Intriago" })).toBe(true);
    expect(esAdminDeChopo({ businessName: "Chopo Snacks" }, { name: "Henry" })).toBe(false);
    expect(esAdminDeChopo({ businessName: "Otra" }, { name: "Juliana Intriago" })).toBe(false);
  });
});
