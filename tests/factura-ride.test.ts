import { describe, expect, it } from "vitest";
import { BinaryBitmap, Code128Reader, HybridBinarizer, RGBLuminanceSource } from "@zxing/library";
import { barrasCode128 } from "../src/lib/code128";
import { codigoProducto } from "../src/lib/facturacion/sri";
import { facturaXml } from "../src/lib/facturacion/sri/xml";
import { dolares, fechaConHora, leerFacturaAutorizada, rideFacturaPdf } from "../src/lib/facturacion/sri/ride";

/**
 * El RIDE de la factura del SRI (lo pidio Chopo Snacks con la foto de la
 * factura de su sistema anterior): el codigo de barras de la clave de acceso,
 * la lectura del XML autorizado y el PDF. El correo al comprador esta en
 * sri.test.ts, con el SRI de mentira.
 */

/** Pinta las barras en una imagen y la lee con ZXing, que no es el mismo codigo que las hizo. */
function leerBarras(texto: string): string {
  const barras = barrasCode128(texto);
  const px = 3;
  const margen = 30;
  const alto = 20;
  const ancho = barras.reduce((s, b) => s + b, 0) * px + margen * 2;
  const lum = new Uint8ClampedArray(ancho * alto).fill(255);
  for (let y = 0; y < alto; y += 1) {
    let x = margen;
    barras.forEach((w, i) => {
      if (i % 2 === 0) for (let k = 0; k < w * px; k += 1) lum[y * ancho + x + k] = 0;
      x += w * px;
    });
  }
  const imagen = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, ancho, alto)));
  return new Code128Reader().decode(imagen).getText();
}

const CLAVE = "0611202601085055466800120010110000003560000000013";

function autorizada(produccion = true): string {
  const xml = facturaXml({
    ambiente: produccion ? "produccion" : "pruebas",
    tipo: "01",
    secuencial: 356,
    clave: CLAVE,
    emisor: {
      ruc: "0850554668001",
      razonSocial: "INTRIAGO ANCHUNDIA HAYDI JULIANA",
      nombreComercial: "CHOPO SNACKS",
      dirMatriz: "PICHINCHA / CAYAMBE / CANGAHUA / AV. DEL TURISTA SN Y BALNEARIO DEL VENADO",
      dirEstablecimiento: "PICHINCHA / CAYAMBE / CANGAHUA",
      establecimiento: "001",
      puntoEmision: "011",
      obligadoContabilidad: false,
      contribuyenteEspecial: null,
      agenteRetencion: null,
      regimen: "GENERAL",
    },
    fecha: "2026-11-06",
    comprador: {
      tipoIdentificacion: "04",
      identificacion: "1724845563001",
      razonSocial: "URETA ZAMBRANO HOLGER JOEL & HIJOS",
      direccion: "RESTAURACION ALIANZA SUR",
      correo: "elbucanero00@gmail.com",
    },
    lineas: [
      { codigo: "CHLG", descripcion: "Chifle largo grande", cantidad: 25, precioUnitario: 0.75, descuento: 0, base: 18.75, tarifa: 0, iva: 0 },
      { codigo: "SG", descripcion: "Salsa <picante>", cantidad: 2, precioUnitario: 1.304348, descuento: 0, base: 2.61, tarifa: 15, iva: 0.39 },
    ],
    pagos: [{ formaPago: "01", total: 21.75 }],
    adicionales: [{ nombre: "Calificación Artesanal", valor: "247166" }],
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?><autorizacion><estado>AUTORIZADO</estado><numeroAutorizacion>' + CLAVE +
    "</numeroAutorizacion><fechaAutorizacion>2026-11-06T10:30:33-05:00</fechaAutorizacion><ambiente>PRODUCCIÓN</ambiente>" +
    "<comprobante><![CDATA[" + xml + "<ds:Signature><ds:codigo>no</ds:codigo></ds:Signature>]]></comprobante></autorizacion>"
  );
}

describe("el codigo de barras de la clave de acceso", () => {
  it("lo lee un lector de verdad: los 49 digitos, y tambien textos y digitos impares", () => {
    for (const t of [CLAVE, "1234", "12345", "ABC-12"]) expect(leerBarras(t)).toBe(t);
  });
});

describe("el codigo del producto", () => {
  it("dos letras de la primera palabra y la inicial de las demas, como CHLG", () => {
    expect(codigoProducto("Chifle largo grande", 1)).toBe("CHLG");
    expect(codigoProducto("Plátano maduro", 1)).toBe("PLM");
    expect(codigoProducto("PAPA GRANDE NAT", 1)).toBe("PAGN");
    expect(codigoProducto("¡¡!!", 3)).toBe("ITEM3");
  });
});

describe("lo que sale del XML autorizado", () => {
  const f = leerFacturaAutorizada(autorizada());

  it("emisor, numero, autorizacion y comprador", () => {
    expect(f).toMatchObject({
      numero: "001-011-000000356",
      numeroAutorizacion: CLAVE,
      claveAcceso: CLAVE,
      produccion: true,
      ruc: "0850554668001",
      nombreComercial: "CHOPO SNACKS",
      obligadoContabilidad: "NO",
      fechaEmision: "2026-11-06",
    });
    expect(f.comprador).toEqual({
      identificacion: "1724845563001",
      razonSocial: "URETA ZAMBRANO HOLGER JOEL & HIJOS",
      direccion: "RESTAURACION ALIANZA SUR",
    });
    expect(fechaConHora(f)).toBe("2026-11-06 10:30:33");
  });

  it("los renglones, los totales por tarifa y la forma de pago", () => {
    expect(f.detalles.map((d) => [d.codigo, d.descripcion, d.cantidad, d.total])).toEqual([
      ["CHLG", "Chifle largo grande", 25, 18.75],
      ["SG", "Salsa <picante>", 2, 2.61],
    ]);
    expect(f.impuestos).toEqual([
      { codigoPorcentaje: "0", base: 18.75, valor: 0 },
      { codigoPorcentaje: "4", base: 2.61, valor: 0.39 },
    ]);
    expect(f.importeTotal).toBe(21.75);
    expect(f.pagos).toEqual([{ formaPago: "01", total: 21.75 }]);
    expect(f.adicionales).toContainEqual({ nombre: "Email", valor: "elbucanero00@gmail.com" });
    expect(f.adicionales).toContainEqual({ nombre: "Calificación Artesanal", valor: "247166" });
  });

  it("no confunde etiquetas de la firma con las de la factura", () => {
    expect(f.detalles.every((d) => d.codigo !== "no")).toBe(true);
  });

  it("un XML que no es factura no se lee", () => {
    expect(() => leerFacturaAutorizada("<autorizacion><comprobante><notaCredito/></comprobante></autorizacion>")).toThrow();
  });
});

describe("el PDF", () => {
  it("dólares como en el RIDE que tenían", () => {
    expect(dolares(18.75)).toBe("$ 18,75");
    expect(dolares(1234.5)).toBe("$ 1.234,50");
  });

  it("es un PDF con el numero, el comprador, los totales y la calificacion artesanal", async () => {
    const pdf = await rideFacturaPdf(leerFacturaAutorizada(autorizada()), {
      telefono: "0982657613",
      correo: "choposnacks@gmail.com",
      calificacionArtesanal: "247166",
    });
    const texto = Buffer.from(pdf).toString("latin1");
    expect(texto.startsWith("%PDF")).toBe(true);
    for (const t of ["001-011-000000356", "URETA ZAMBRANO", "Valor Total", "$ 21,75", "SUBTOTAL 15%", "IVA 15%", "247166", "CHLG"]) {
      expect(texto).toContain(t);
    }
    expect(texto).not.toContain("SIN VALIDEZ TRIBUTARIA");
  });

  it("en pruebas lo dice, y un logo que no sirve no la tumba", async () => {
    const pdf = await rideFacturaPdf(leerFacturaAutorizada(autorizada(false)), { logo: "data:image/png;base64,no-es-imagen" });
    const texto = Buffer.from(pdf).toString("latin1");
    expect(texto).toContain("SIN VALIDEZ TRIBUTARIA");
    expect(texto).toContain("CHOPO SNACKS");
  });
});
