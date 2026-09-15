import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { filasDeTexto, filasDeVcf, leerClientes, leerProductos, limpiarCorreo, limpiarTelefono } from "../src/lib/importar";
import { filasDeLibro, leerArchivo } from "../src/lib/leer-archivo";

/**
 * Leer el archivo completo de clientes o productos.
 *
 * Paso que los telefonos y los correos no se leian: si el encabezado del
 * nombre no se reconocia, las columnas se tomaban por posicion y quedaban
 * corridas. Lo que se fija: encabezados bajo un titulo, nombre y apellido
 * separados, columnas en ingles, telefono y correo reconocidos por los datos,
 * lo que Excel le hace a un celular, corregir una columna a mano, y los
 * formatos: Excel, LibreOffice, CSV de Windows y contactos del celular.
 */
const vacio = { document: "", address: "", notes: "" };

describe("reconocer el archivo completo", () => {
  it("encuentra los encabezados bajo un título y une nombre y apellido", () => {
    const r = leerClientes(
      filasDeTexto(
        "Lista de clientes 2026;;;\n;;;\nNombres;Apellidos;Número de celular;E-mail\nAna;Pérez;300 123 4567;ana@correo.com\nLuis;Gómez;+57 310 987 6543;LUIS@Correo.com"
      )
    );
    expect(r.filas).toEqual([
      { name: "Ana Pérez", phone: "300 123 4567", email: "ana@correo.com", ...vacio },
      { name: "Luis Gómez", phone: "+57 310 987 6543", email: "luis@correo.com", ...vacio },
    ]);
    expect(r.nombreUnido).toBe(true);
    expect(r.columnas).toEqual(["name", "phone", "email"]);
  });

  it("lee los contactos exportados de Outlook o Gmail, en inglés", () => {
    const r = leerClientes(
      filasDeTexto('"First Name","Last Name","E-mail Address","Mobile Phone","Business Phone"\n"Carlos","Ruiz","carlos@x.com","+57 300 111 2233","601 555 1234"')
    );
    expect(r.filas).toEqual([{ name: "Carlos Ruiz", phone: "+57 300 111 2233", email: "carlos@x.com", ...vacio }]);
  });

  it("sin encabezados conocidos, reconoce el nombre, el teléfono y el correo por los datos", () => {
    const r = leerClientes(filasDeTexto("Persona;Dato;Otro\nAna Pérez;3001234567;ana@x.co\nLuis Gómez;3109876543;luis@y.co"));
    expect(r.filas).toEqual([
      { name: "Ana Pérez", phone: "3001234567", email: "ana@x.co", ...vacio },
      { name: "Luis Gómez", phone: "3109876543", email: "luis@y.co", ...vacio },
    ]);
    expect(r.porContenido).toEqual(expect.arrayContaining(["phone", "email"]));
    expect(r.encabezados).toEqual(["Persona", "Dato", "Otro"]);
  });

  it("con encabezados raros, el correo y el teléfono igual se encuentran", () => {
    const r = leerClientes(filasDeTexto("Nombre\tContacto 1\tContacto 2\nAna\tana@x.co\t3001234567"));
    expect(r.filas[0]).toMatchObject({ name: "Ana", phone: "3001234567", email: "ana@x.co" });
  });

  it("limpia lo que le hace Excel al teléfono y al correo", () => {
    expect(limpiarTelefono("3,001234567E+09")).toBe("3001234567");
    expect(limpiarTelefono("3109876543.0")).toBe("3109876543");
    expect(limpiarTelefono("300 123 4567 / 310 000 0000")).toBe("300 123 4567");
    expect(limpiarCorreo("mailto:Ana@X.co; otra@y.co")).toBe("ana@x.co");
  });

  it("deja corregir una columna a mano", () => {
    const filas = filasDeTexto("Nombre;Tel 1;Tel 2\nAna;6015551234;3001234567");
    expect(leerClientes(filas).filas[0].phone).toBe("6015551234");
    const corregido = leerClientes(filas, { phone: 2 });
    expect(corregido.filas[0].phone).toBe("3001234567");
    expect(corregido.indice.phone).toBe(2);
  });

  it("productos: encabezados en otra fila y en inglés", () => {
    const r = leerProductos(filasDeTexto("Inventario\nProduct;Price;Qty\nGorra;20000;5"));
    expect(r.filas).toEqual([{ name: "Gorra", price: "20000", cost: "", category: "", description: "", stock: "5" }]);
  });
});

describe("contactos del celular (.vcf)", () => {
  it("saca nombre, teléfono, correo, dirección y notas, con tildes y líneas partidas", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:P=C3=A9rez;Jos=C3=A9;;;",
      "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jos=C3=A9 P=C3=A9rez",
      "TEL;CELL:+57 300 123 4567",
      "TEL;HOME:601 555 0000",
      "EMAIL;HOME:jose@correo.com",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Gómez;Luisa;;;",
      "item1.TEL;type=CELL:310 987",
      " 6543",
      "ADR;TYPE=HOME:;;Calle 10 # 5-20;Bogotá;;;Colombia",
      "NOTE:Cliente\\, frecuente",
      "END:VCARD",
    ].join("\r\n");
    expect(filasDeVcf(vcf)).toEqual([
      ["Nombre", "Teléfono", "Correo", "Dirección", "Notas"],
      ["José Pérez", "+57 300 123 4567", "jose@correo.com", "", ""],
      ["Luisa Gómez", "310 9876543", "", "Calle 10 # 5-20, Bogotá, Colombia", "Cliente, frecuente"],
    ]);
    const r = leerClientes(filasDeVcf(vcf));
    expect(r.filas.map((f) => [f.name, f.phone])).toEqual([
      ["José Pérez", "+57 300 123 4567"],
      ["Luisa Gómez", "310 9876543"],
    ]);
  });
});

describe("Excel, LibreOffice y CSV", () => {
  for (const formato of ["xlsx", "xls", "ods"] as const) {
    it("lee " + formato + " desde la hoja con datos, con el celular guardado como número", async () => {
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([["Portada"]]), "Portada");
      XLSX.utils.book_append_sheet(
        libro,
        XLSX.utils.aoa_to_sheet([
          ["Clientes del local"],
          [],
          ["Nombre", "Celular", "Correo"],
          ["Ana Pérez", 3001234567, "ana@correo.com"],
          ["Luis Gómez", 3109876543, "luis@correo.com"],
        ]),
        "Clientes"
      );
      const bytes = XLSX.write(libro, { type: "array", bookType: formato === "xls" ? "biff8" : formato }) as ArrayBuffer;
      const { filas, hoja } = await filasDeLibro(bytes);
      expect(hoja).toBe("Clientes");
      expect(leerClientes(filas).filas[0]).toMatchObject({ name: "Ana Pérez", phone: "3001234567", email: "ana@correo.com" });
      expect(await leerArchivo(new File([bytes], "clientes." + formato))).toMatchObject({ ok: true, hoja: "Clientes" });
    });
  }

  it("un CSV de Excel en Windows no pierde las tildes; un .vcf se reconoce; una foto no", async () => {
    const windows = Uint8Array.from("Nombre;Tel\xe9fono\nJos\xe9;3001234567", (c) => c.charCodeAt(0));
    const csv = await leerArchivo(new File([windows], "clientes.csv"));
    expect(csv.ok && leerClientes(csv.filas).filas[0]).toMatchObject({ name: "José", phone: "3001234567" });

    const vcf = await leerArchivo(new File(["BEGIN:VCARD\nFN:Ana\nTEL:3001234567\nEND:VCARD"], "contactos.vcf"));
    expect(vcf).toMatchObject({ ok: true, formato: "Contactos del celular" });

    expect((await leerArchivo(new File(["x"], "foto.jpg"))).ok).toBe(false);
  });
});
