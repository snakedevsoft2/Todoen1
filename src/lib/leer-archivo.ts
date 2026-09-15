import { filasDeTexto, filasDeVcf } from "./importar";

/**
 * Abrir en el navegador el archivo con la lista de clientes o de productos.
 *
 * Excel (.xlsx, .xls), LibreOffice (.ods) y Numbers se leen con SheetJS, que
 * se baja solo cuando alguien sube uno de esos. CSV y texto se leen aqui, con
 * la tabla de letras que traiga (Excel en Windows no guarda en UTF-8). Los
 * contactos del celular (.vcf) salen como una tabla con nombre, telefono y
 * correo. Nada de esto sube el archivo al servidor: solo sube las filas.
 */

export const EXTENSIONES_ARCHIVO =
  ".xlsx,.xls,.xlsm,.xlsb,.ods,.numbers,.csv,.tsv,.txt,.vcf," +
  "text/csv,text/plain,text/tab-separated-values,text/vcard,text/x-vcard," +
  "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.oasis.opendocument.spreadsheet";

export const MAX_BYTES_ARCHIVO = 10 * 1024 * 1024;

const LIBROS = ["xlsx", "xls", "xlsm", "xlsb", "ods", "numbers"];

export type ArchivoLeido =
  | { ok: true; filas: string[][]; formato: string; hoja?: string }
  | { ok: false; error: string };

function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Excel en Windows guarda el CSV con otra tabla de letras: sin esto las
    // tildes y la ñ salen como simbolos raros.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Lo que trae una celda de Excel, como texto: el celular 3001234567 y no 3.001234567E+09. */
export function celdaATexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** Las filas de un libro de Excel, LibreOffice o Numbers: las de la hoja con mas datos. */
export async function filasDeLibro(bytes: ArrayBuffer): Promise<{ filas: string[][]; hoja: string }> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(new Uint8Array(bytes), { type: "array", cellDates: true });
  let mejor = { filas: [] as string[][], hoja: "" };
  for (const nombre of libro.SheetNames) {
    const crudas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: "", blankrows: false });
    const filas = crudas.map((f) => (Array.isArray(f) ? f : []).map(celdaATexto)).filter((f) => f.some((c) => c !== ""));
    if (filas.length > mejor.filas.length) mejor = { filas, hoja: nombre };
  }
  return mejor;
}

export async function leerArchivo(archivo: File): Promise<ArchivoLeido> {
  if (archivo.size > MAX_BYTES_ARCHIVO) return { ok: false, error: "El archivo pesa más de 10 MB. Divídelo en partes." };
  const nombre = archivo.name.toLowerCase();
  const ext = nombre.includes(".") ? nombre.slice(nombre.lastIndexOf(".") + 1) : "";
  if (["pdf", "doc", "docx", "jpg", "jpeg", "png", "heic", "webp"].includes(ext)) {
    return {
      ok: false,
      error: "Ese archivo no trae una tabla que se pueda leer. Sube un Excel (.xlsx), un CSV o los contactos del celular (.vcf).",
    };
  }

  try {
    const bytes = await archivo.arrayBuffer();
    const inicio = new Uint8Array(bytes.slice(0, 4));
    // Un .xlsx u .ods es un zip (empieza por "PK") y un .xls viejo empieza por D0 CF: se reconocen aunque no traigan extension.
    const esLibro = LIBROS.includes(ext) || (inicio[0] === 0x50 && inicio[1] === 0x4b) || (inicio[0] === 0xd0 && inicio[1] === 0xcf);
    if (esLibro) {
      const { filas, hoja } = await filasDeLibro(bytes);
      const formato = ext === "ods" ? "LibreOffice" : ext === "numbers" ? "Numbers" : "Excel";
      return { ok: true, filas, formato, hoja };
    }
    const contenido = decodificar(bytes);
    if (ext === "vcf" || /^\s*BEGIN:VCARD/i.test(contenido)) {
      return { ok: true, filas: filasDeVcf(contenido), formato: "Contactos del celular" };
    }
    return { ok: true, filas: filasDeTexto(contenido), formato: ext === "tsv" ? "TSV" : ext === "txt" ? "Texto" : "CSV" };
  } catch {
    return { ok: false, error: "No pudimos leer ese archivo. Guárdalo como Excel (.xlsx) o CSV y vuelve a intentarlo." };
  }
}
