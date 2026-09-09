/**
 * Armado de archivos para Excel.
 *
 * Excel en español espera punto y coma, no coma, y no adivina que el archivo
 * viene en UTF-8 si no le ponemos la marca al principio. Sin esas dos cosas
 * las tildes salen rotas y todo cae en una sola columna, que es justo lo que
 * hace que la gente deje de usar la exportacion.
 */
const SEP = ";";

function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  // Un valor con separador, comillas o salto de linea va entre comillas.
  if (/[";\n\r]/.test(texto)) return '"' + texto.replace(/"/g, '""') + '"';
  return texto;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lineas = [
    // Le dice a Excel cual es el separador, sin importar la configuracion.
    "sep=" + SEP,
    headers.map(celda).join(SEP),
    ...rows.map((row) => row.map(celda).join(SEP)),
  ];
  return lineas.join("\r\n");
}

/** Respuesta lista para descargar, con la marca UTF-8 al principio. */
export function csvResponse(nombre: string, contenido: string): Response {
  const bom = "﻿";
  return new Response(bom + contenido, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="' + nombre + '"',
      "Cache-Control": "no-store",
    },
  });
}

/** Los numeros van con coma decimal, como los espera Excel en español. */
export function numero(valor: number): string {
  return String(valor).replace(".", ",");
}
