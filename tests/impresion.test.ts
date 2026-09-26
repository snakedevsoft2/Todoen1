import { describe, expect, it } from "vitest";
import { aBytes, columnasDe, par, partir, tirillaEscPos } from "../src/lib/escpos";
import { tirillaHtml, type Linea } from "../src/lib/tirilla";
import { invoiceTirilla } from "../src/lib/invoice";

/**
 * El recibo que sale por la impresora.
 *
 * No se puede probar con una impresora de verdad, asi que se fija lo que la
 * impresora recibe: que la ñ y las tildes lleguen en la tabla que entiende la
 * termica, que nada se salga del ancho del rollo y que un nombre raro no
 * rompa el recibo en HTML.
 */

const venta = invoiceTirilla({
  saleId: "clx0000000000venta1234",
  businessName: "Comidas La Ñapa",
  businessPhone: "300 000 0000",
  businessAddress: "Calle 10 #4-20",
  logoUrl: null,
  currency: "COP",
  day: "2026-09-14",
  clientName: "José Muñoz",
  paymentMethod: "EFECTIVO",
  staffName: null,
  items: [{ name: "Hamburguesa doble con tocineta, queso cheddar y papas en casco", qty: 2, unitPrice: 14000 }],
  total: 28000,
  notes: null,
});

function textoDe(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

/** Lo que la impresora escribe, sin los comandos (reinicio, alinear, negrita, tamano, corte). */
function soloTexto(bytes: Uint8Array): string {
  let t = "";
  for (let i = 0; i < bytes.length; ) {
    if (bytes[i] === 0x1b) i += bytes[i + 1] === 0x40 ? 2 : 3;
    else if (bytes[i] === 0x1d) i += bytes[i + 1] === 0x56 ? 4 : 3;
    else t += String.fromCharCode(bytes[i++]);
  }
  return t;
}

describe("recibo para termica sin driver (ESC/POS)", () => {
  it("empieza reiniciando la impresora y pidiendo la tabla PC437", () => {
    const b = tirillaEscPos(venta, 58);
    expect(Array.from(b.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 0]);
  });

  it("manda la ñ y las tildes en la tabla de la termica", () => {
    expect(aBytes("ñÑáéíóú¿¡")).toEqual([0xa4, 0xa5, 0xa0, 0x82, 0xa1, 0xa2, 0xa3, 0xa8, 0xad]);
    // La que no esta en la tabla sale sin tilde, no como un simbolo raro.
    expect(aBytes("Ángel")).toEqual(Array.from("Angel", (c) => c.charCodeAt(0)));
  });

  it("escribe el signo de pesos con espacio normal", () => {
    expect(aBytes("$ 14.000")).toEqual(Array.from("$ 14.000", (c) => c.charCodeAt(0)));
  });

  it("ningun renglon se sale del rollo", () => {
    for (const ancho of [58, 80] as const) {
      // Sale de columnasDe y no de un numero escrito aqui: el ancho depende de
      // que letra se le pida a la impresora, y las dos cosas tienen que
      // moverse juntas.
      const cols = columnasDe(ancho);
      const renglones = soloTexto(tirillaEscPos(venta, ancho)).split("\n");
      for (const r of renglones) expect(r.length).toBeLessThanOrEqual(cols);
    }
  });

  it("de fabrica no le cambia la letra a la impresora", () => {
    // Se intento mandar ESC M 1 (la letra chica) para gastar menos papel y la
    // termica del mostrador solto el papel EN BLANCO en plena jornada. Desde
    // entonces no se toca la letra salvo que la persona lo pida a proposito.
    // Ver LETRA_CHICA en lib/escpos.ts.
    const b = Array.from(tirillaEscPos(venta, 58));
    expect(b.some((x, n) => x === 0x1b && b[n + 1] === 0x4d)).toBe(false);
    expect(b.some((x, n) => x === 0x1b && b[n + 1] === 0x21)).toBe(false);
  });

  it("con la letra chica prendida la pide con ESC ! y cuenta 42 columnas", () => {
    const b = Array.from(tirillaEscPos(venta, 58, true));
    const i = b.findIndex((x, n) => x === 0x1b && b[n + 1] === 0x21);
    expect(i).toBeGreaterThan(-1);
    expect(b[i + 2]).toBe(0x01);
    // Nunca con el comando que dejo el papel en blanco.
    expect(b.some((x, n) => x === 0x1b && b[n + 1] === 0x4d)).toBe(false);
    expect(columnasDe(58, true)).toBe(42);
    expect(columnasDe(80, true)).toBe(64);
  });

  it("con la letra chica los renglones tampoco se salen del rollo", () => {
    for (const ancho of [58, 80] as const) {
      const cols = columnasDe(ancho, true);
      for (const r of soloTexto(tirillaEscPos(venta, ancho, true)).split("\n")) {
        expect(r.length).toBeLessThanOrEqual(cols);
      }
    }
  });

  it("parte el nombre largo del producto sin perderlo", () => {
    const renglones = partir("Hamburguesa doble con tocineta, queso cheddar y papas en casco", 32);
    expect(renglones.length).toBeGreaterThan(1);
    expect(renglones.join(" ")).toBe("Hamburguesa doble con tocineta, queso cheddar y papas en casco");
  });

  it("pone el valor contra el borde derecho", () => {
    const [r] = par("TOTAL", "$ 28.000", 32);
    expect(r).toHaveLength(32);
    expect(r.startsWith("TOTAL")).toBe(true);
    expect(r.endsWith("$ 28.000")).toBe(true);
  });

  it("lleva el detalle de la venta y termina con el corte", () => {
    const b = tirillaEscPos(venta, 58);
    const t = textoDe(b);
    expect(t).toContain("Hamburguesa doble");
    expect(t).toContain("28.000");
    expect(Array.from(b.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });
});

describe("recibo por el dialogo de impresion", () => {
  it("un texto con etiquetas no se vuelve HTML", () => {
    const lineas: Linea[] = [{ t: "titulo", text: '<img src=x onerror="alert(1)">' }];
    const html = tirillaHtml(lineas, "58");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("el logo va arriba de todo, en los tres tamaños", () => {
    for (const formato of ["58", "80", "a4"] as const) {
      const html = tirillaHtml(venta, formato, "/logo.png");
      expect(html).toContain('src="/logo.png"');
      expect(html.indexOf("ti-logo")).toBeLessThan(html.indexOf("ti-titulo"));
    }
  });

  it("sin logo el recibo sale igual, sin una imagen rota", () => {
    expect(tirillaHtml(venta, "58", null)).not.toContain("<img");
    expect(tirillaHtml(venta, "58")).not.toContain("<img");
  });

  it("la venta hecha sin senal dice que se registro asi, sin un numero que despues cambia", () => {
    const sinSenal = invoiceTirilla({
      saleId: "llave-del-telefono",
      provisional: true,
      businessName: "Tienda",
      businessPhone: null,
      businessAddress: null,
      logoUrl: null,
      currency: "COP",
      day: "2026-09-14",
      clientName: null,
      paymentMethod: "EFECTIVO",
      staffName: null,
      items: [],
      total: 5000,
      notes: null,
    });
    const html = tirillaHtml(sinSenal, "58");
    expect(html).toContain("sin señal");
    expect(html).not.toContain("No. ");
  });
});
