import { describe, expect, it } from "vitest";
import { buildInvoicePdf, invoiceTirilla, type AutorizacionFactura, type InvoiceData } from "../src/lib/invoice";

/**
 * El encabezado de la factura con los datos del negocio (RUC, razón social,
 * sucursal, correo) y del cliente (identificación, teléfono, vendedor), en el
 * mismo estilo con el que Datil entrega la factura autorizada.
 *
 * Lo que se fija: que esos datos salgan cuando se tienen, que no salgan
 * cuando no aplican (una venta normal sin factura autorizada), y que el PDF
 * se arme sin reventar con y sin esos datos.
 */
const autorizacion: AutorizacionFactura = {
  pais: "EC",
  numero: "001-010-000000999",
  etiquetaCodigo: "Clave de acceso",
  codigo: "1234567890",
  qr: "1234567890",
  fecha: "2026-09-15T10:00:00Z",
  pruebas: false,
  compradorDocumento: "Consumidor final · 9999999999999",
  emisorRuc: "0850554668001",
  emisorRazonSocial: "INTRIAGO ANCHUNDIA HAYDI JULIANA",
  emisorEstablecimiento: "001",
  subtotal: 20,
  impuesto: 0,
  etiquetaImpuesto: "IVA 0%",
};

const base: InvoiceData = {
  saleId: "venta-choposnacks",
  businessName: "Chopo Snacks",
  businessPhone: "0982657613",
  businessAddress: "Pichincha / Cayambe / Cangahua",
  businessEmail: "choposnacks@gmail.com",
  logoUrl: null,
  currency: "USD",
  day: "2026-09-15",
  clientName: null,
  clientPhone: null,
  paymentMethod: "EFECTIVO",
  staffName: "Usuario Demo",
  items: [{ name: "Servicio X", qty: 1, unitPrice: 20 }],
  total: 20,
};

describe("el encabezado de la factura autorizada", () => {
  it("trae el RUC, la razón social, la sucursal, el correo y el número como «Recibo»", () => {
    const lineas = invoiceTirilla({ ...base, autorizacion });
    const textos = lineas.map((l) => ("text" in l ? l.text : "value" in l ? l.label + ": " + l.value : "")).join(" | ");
    expect(textos).toContain("INTRIAGO ANCHUNDIA HAYDI JULIANA");
    expect(textos).toContain("RUC: 0850554668001");
    expect(textos).toContain("Sucursal: 001");
    expect(textos).toContain("Correo: choposnacks@gmail.com");
    expect(textos).toContain("Recibo: 001-010-000000999");
    expect(textos).not.toContain("No. ");
    expect(textos).not.toContain("FACTURA ELECTRONICA DE VENTA");
  });

  it("trae la identificación, el teléfono del cliente y el vendedor", () => {
    const lineas = invoiceTirilla({ ...base, clientPhone: "0999999999", autorizacion });
    const pares = lineas.filter((l): l is { t: "par"; label: string; value: string } => l.t === "par");
    expect(pares).toContainEqual({ t: "par", label: "Identificación", value: "Consumidor final · 9999999999999" });
    expect(pares).toContainEqual({ t: "par", label: "Teléfono", value: "0999999999" });
    expect(pares).toContainEqual({ t: "par", label: "Vendedor", value: "Usuario Demo" });
    expect(pares).toContainEqual({ t: "par", label: "Cliente", value: "Consumidor final" });
  });

  it("sin factura autorizada no inventa RUC, sucursal ni identificación", () => {
    const lineas = invoiceTirilla(base);
    const textos = lineas.map((l) => ("text" in l ? l.text : "value" in l ? l.label + ": " + l.value : "")).join(" | ");
    expect(textos).not.toContain("RUC:");
    expect(textos).not.toContain("Sucursal:");
    expect(textos).not.toContain("Identificación");
    expect(textos).toContain("Correo: choposnacks@gmail.com");
    expect(textos).toContain("Recibo: ");
  });

  it("el PDF se arma sin reventar, con y sin factura autorizada", async () => {
    const conAutorizacion = await buildInvoicePdf({ ...base, clientPhone: "0999999999", autorizacion });
    expect(conAutorizacion.type).toBe("application/pdf");
    expect(conAutorizacion.size).toBeGreaterThan(0);
    expect(conAutorizacion.name).toContain("factura-electronica-");

    const normal = await buildInvoicePdf(base);
    expect(normal.size).toBeGreaterThan(0);
    expect(normal.name).toContain("factura-");
    expect(normal.name).not.toContain("factura-electronica-");
  });
});
