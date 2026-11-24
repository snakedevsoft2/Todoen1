import { describe, expect, it } from "vitest";
import { armarCobro, armarVenta, leerAdicionales, leerPedidoVenta } from "../src/lib/cobro-cita";
import { esManicuristaDeMbNails, esMbNails, rutaDeManicurista } from "../src/lib/mb-nails";
import { parseMoney } from "../src/lib/format";

const plata = (v: string) => parseMoney(v, "COP", 1000);
const catalogo = new Map([
  ["coca", { name: "Coca Cola 400ml", price: 3500 }],
  ["cejas", { name: "Cejas", price: 15000 }],
]);
const cita = { serviceId: "semi", serviceName: "Semi (manos o pies)", price: 45000 };

/** El cobro de la cita que la manicurista marca como Cerrada. */
describe("cobro de una cita cerrada", () => {
  it("el servicio a su precio, mas lo de la lista y lo otro", () => {
    const r = armarCobro(
      cita,
      [
        { tipo: "lista", serviceId: "coca", qty: 2 },
        { tipo: "otro", nombre: "  Decorado   con piedras ", valor: "10.000" },
      ],
      catalogo,
      plata
    );
    expect(r).toEqual({
      items: [
        { serviceId: "semi", name: "Semi (manos o pies)", unitPrice: 45000, qty: 1 },
        { serviceId: "coca", name: "Coca Cola 400ml", unitPrice: 3500, qty: 2 },
        { serviceId: null, name: "Decorado con piedras", unitPrice: 10000, qty: 1 },
      ],
      total: 62000,
    });
  });

  it("sin adicionales es solo el servicio", () => {
    expect(armarCobro(cita, [], catalogo, plata)).toMatchObject({ total: 45000 });
  });

  it("el precio de lo de la lista sale del catálogo, no del teléfono", () => {
    // Aunque el formulario mandara otra cosa, solo se lee el id y la cantidad.
    const pedidos = leerAdicionales(JSON.stringify([{ tipo: "lista", serviceId: "cejas", qty: 1, price: 1 }]))!;
    expect(armarCobro(cita, pedidos, catalogo, plata)).toMatchObject({ total: 60000 });
  });

  it("'10' en pesos es 10.000, como en el resto de la barbería", () => {
    expect(armarCobro(cita, [{ tipo: "otro", nombre: "Decorado", valor: "10" }], catalogo, plata)).toMatchObject({ total: 55000 });
  });

  it("rechaza lo que no está en la lista, cantidades raras y lo otro sin nombre o sin valor", () => {
    expect(armarCobro(cita, [{ tipo: "lista", serviceId: "otro-negocio", qty: 1 }], catalogo, plata)).toHaveProperty("error");
    expect(armarCobro(cita, [{ tipo: "lista", serviceId: "coca", qty: 0 }], catalogo, plata)).toHaveProperty("error");
    expect(armarCobro(cita, [{ tipo: "lista", serviceId: "coca", qty: 99 }], catalogo, plata)).toHaveProperty("error");
    expect(armarCobro(cita, [{ tipo: "otro", nombre: " ", valor: "5000" }], catalogo, plata)).toHaveProperty("error");
    expect(armarCobro(cita, [{ tipo: "otro", nombre: "Decorado", valor: "-5000" }], catalogo, plata)).toHaveProperty("error");
    const muchos = Array.from({ length: 16 }, () => ({ tipo: "lista" as const, serviceId: "coca", qty: 1 }));
    expect(armarCobro(cita, muchos, catalogo, plata)).toHaveProperty("error");
  });

  it("lee lo que manda el formulario y rechaza lo que no entiende", () => {
    expect(leerAdicionales("")).toEqual([]);
    expect(leerAdicionales("no es json")).toBeNull();
    expect(leerAdicionales('{"tipo":"lista"}')).toBeNull();
    expect(leerAdicionales('[{"tipo":"regalo"}]')).toBeNull();
  });
});

describe("quién es manicurista de MB Nails", () => {
  it("reconoce el negocio sin importar mayúsculas ni espacios", () => {
    expect(esMbNails("MB NAILS SPA")).toBe(true);
    expect(esMbNails("  mb nails   spa ")).toBe(true);
    expect(esMbNails("MB Nails Spa Cali")).toBe(false);
    expect(esMbNails("Chopo Snacks")).toBe(false);
  });

  it("solo las empleadas de MB Nails en barbería, no la dueña", () => {
    expect(esManicuristaDeMbNails({ businessName: "MB NAILS SPA", businessType: "BARBERIA" }, { role: "BARBERO" })).toBe(true);
    expect(esManicuristaDeMbNails({ businessName: "MB NAILS SPA", businessType: "BARBERIA" }, { role: "DUENO" })).toBe(false);
    expect(esManicuristaDeMbNails({ businessName: "Barbería El Corte", businessType: "BARBERIA" }, { role: "BARBERO" })).toBe(false);
  });

  it("su menú fijo", () => {
    expect(rutaDeManicurista("/panel/mis-citas")).toBe(true);
    expect(rutaDeManicurista("/panel/precios")).toBe(true);
    expect(rutaDeManicurista("/panel/ventas")).toBe(false);
    expect(rutaDeManicurista("/panel/catalogo")).toBe(false);
  });
});

/** Mecato: la venta sin cita de la manicurista. */
describe("venta de mecato sin cita", () => {
  it("toma el precio del catálogo y junta el mismo producto", () => {
    const pedido = leerPedidoVenta(JSON.stringify([
      { serviceId: "coca", qty: 2, price: 1 },
      { serviceId: "cejas", qty: 1 },
      { serviceId: "coca", qty: 1 },
    ]))!;
    expect(armarVenta(pedido, catalogo)).toEqual({
      items: [
        { serviceId: "coca", name: "Coca Cola 400ml", unitPrice: 3500, qty: 3 },
        { serviceId: "cejas", name: "Cejas", unitPrice: 15000, qty: 1 },
      ],
      total: 25500,
    });
  });

  it("no guarda una venta vacía, ni de otro negocio, ni cantidades raras", () => {
    expect(armarVenta([], catalogo)).toHaveProperty("error");
    expect(armarVenta([{ serviceId: "de-otro", qty: 1 }], catalogo)).toHaveProperty("error");
    expect(armarVenta([{ serviceId: "coca", qty: 0 }], catalogo)).toHaveProperty("error");
    expect(armarVenta([{ serviceId: "coca", qty: 51 }], catalogo)).toHaveProperty("error");
    expect(leerPedidoVenta("[{}]")).toBeNull();
    expect(leerPedidoVenta("roto")).toBeNull();
  });
});
