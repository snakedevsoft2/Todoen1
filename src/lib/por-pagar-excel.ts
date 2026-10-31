import { read, utils, type CellObject, type WorkSheet } from "xlsx";
import { normalizar } from "./orden-productos";
import { redondear, subtotalesDe, totalDe } from "./por-pagar";
import { fechaDe } from "./reparto-excel";

/**
 * Lee el Excel "CUENTAS POR PAGAR PROVEEDORES" de Chopo Snacks: una hoja por
 * proveedor. Lo importa lib/por-pagar-importar.ts.
 *
 * La hoja normal tiene una fila de titulos (FECHA, CANTIDAD, DESCRIPCIÓN,
 * PRECIO UNI, [DESCUEN], SUB TOTAL, TOTAL, ESTADO y, a veces, a la derecha otra
 * vez PRECIO UNI / SUBTOTAL / TOTAL con el precio de venta). Cada compra
 * empieza en la fila que trae fecha, y sus renglones son los que suma su TOTAL
 * (el SUM(F10:F23) de la formula), no los que haya hasta la siguiente fecha.
 * El IVA sale de la misma formula (SUM(...)*1.15 es 15 %).
 *
 * La hoja PAY es distinta: es un cruce de cuentas. Lo que se le debe a PAY es
 * la lista "CUENTAS POR PAGAR" (fecha y valor); lo que la formula de
 * "DESCONTADO" resta ya se pago descontandolo de sus facturas.
 */

export type RenglonExcel = { description: string; qty: number; unitPrice: number; discount: number; salePrice: number | null };

export type CompraExcel = {
  /** "HOJA!fila": con esto no se importa dos veces. */
  ref: string;
  day: string;
  document: string | null;
  notes: string | null;
  taxPct: number;
  pagada: boolean;
  items: RenglonExcel[];
  /** Lo que el Excel dice que suma, para comprobar. Nulo si la hoja no tiene columna TOTAL. */
  totalExcel: number | null;
};

export type ProveedorExcel = { nombre: string; hoja: string; notas: string | null; compras: CompraExcel[] };

export type LibroPorPagar = { proveedores: ProveedorExcel[]; avisos: string[] };

const texto = (c: CellObject | undefined) => (c?.v === undefined || c?.v === null ? "" : String(c.v).replace(/\s+/g, " ").trim());
const numero = (c: CellObject | undefined): number | null => {
  if (!c || c.v === undefined || c.v === null || c.v === "") return null;
  if (typeof c.v === "number") return c.v;
  const n = Number(String(c.v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const clave = (c: CellObject | undefined) => normalizar(texto(c));
const col = (n: number) => utils.encode_col(n);

/** Fecha de una celda, tambien la escrita como "2026-08-06 10:48". */
function fechaDeCelda(c: CellObject | undefined): string | null {
  const t = texto(c);
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[1] + "-" + iso[2] + "-" + iso[3] : fechaDe(c);
}

function filasDeSuma(f: string | undefined): [number, number] | null {
  const m = (f ?? "").toUpperCase().match(/SUM\(\$?[A-Z]+\$?(\d+):\$?[A-Z]+\$?(\d+)\)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** "SUM(G10:G12)*1.15" -> 15. */
function ivaDeFormula(f: string | undefined): number {
  const m = (f ?? "").match(/\)\s*\*\s*1[.,](\d{1,2})\b/);
  return m ? Number(m[1].padEnd(2, "0")) : 0;
}

function leerHojaNormal(ws: WorkSheet, hoja: string, avisos: string[]): CompraExcel[] {
  const rango = utils.decode_range(ws["!ref"]!);
  const celda = (c: number, r: number) => ws[col(c) + r];

  // La fila de titulos y que columna es cada cosa.
  let titulos = 0;
  for (let r = rango.s.r + 1; r <= Math.min(rango.e.r + 1, 40) && !titulos; r++) {
    const fila = Array.from({ length: rango.e.c + 1 }, (_, c) => clave(celda(c, r)));
    if (fila.includes("fecha") && fila.some((t) => t.startsWith("cantidad")) && fila.some((t) => t.startsWith("descripci"))) titulos = r;
  }
  if (!titulos) return [];
  const cols: Record<string, number[]> = {};
  for (let c = rango.s.c; c <= rango.e.c; c++) {
    const t = clave(celda(c, titulos));
    const k =
      t === "fecha" ? "fecha"
      : t.startsWith("cantidad") ? "cantidad"
      : t.startsWith("descripci") ? "descripcion"
      : t.startsWith("precio") || t.startsWith("recio") ? "precio"
      : t.startsWith("descuen") ? "descuento"
      : t.replace(/\s/g, "").startsWith("subtot") ? "subtotal"
      : t === "total" ? "total"
      : t.startsWith("estado") ? "estado"
      : null;
    if (k) (cols[k] ??= []).push(c);
  }
  const [cFecha, cCant, cDesc, cPrecio, cDcto, cTotal, cEstado] = [
    cols.fecha?.[0], cols.cantidad?.[0], cols.descripcion?.[0], cols.precio?.[0], cols.descuento?.[0], cols.total?.[0], cols.estado?.[0],
  ];
  // El segundo PRECIO UNI, a la derecha del primer ESTADO, es el de venta.
  const cVenta = cols.precio?.find((c) => c > (cEstado ?? cTotal ?? cPrecio ?? 0) && c !== cPrecio);
  if (cFecha === undefined || cCant === undefined || cDesc === undefined) return [];

  const renglon = (r: number): RenglonExcel | null => {
    const description = texto(celda(cDesc, r));
    const qty = numero(celda(cCant, r)) ?? 0;
    if (!description && !qty) return null;
    if (typeof celda(cCant, r)?.v === "string" && !qty) return null;
    return {
      description: description || "Sin descripción",
      qty,
      unitPrice: cPrecio !== undefined ? numero(celda(cPrecio, r)) ?? 0 : 0,
      discount: cDcto !== undefined ? numero(celda(cDcto, r)) ?? 0 : 0,
      salePrice: cVenta !== undefined ? numero(celda(cVenta, r)) : null,
    };
  };

  const finDeHoja = rango.e.r + 2;
  const inicios: number[] = [];
  for (let r = titulos + 1; r <= rango.e.r + 1; r++) if (fechaDeCelda(celda(cFecha, r))) inicios.push(r);
  const usadas = new Set<number>();
  const compras: CompraExcel[] = [];
  for (const [i, r0] of inicios.entries()) {
    const totalCelda = cTotal !== undefined ? celda(cTotal, r0) : undefined;
    const filas = filasDeSuma(totalCelda?.f) ?? [r0, (inicios[i + 1] ?? finDeHoja) - 1];
    const items: RenglonExcel[] = [];
    for (let r = filas[0]; r <= filas[1]; r++) {
      usadas.add(r);
      const x = renglon(r);
      if (x && x.qty > 0) items.push(x);
    }
    if (!items.length) continue;
    const taxPct = ivaDeFormula(totalCelda?.f) || (() => {
      const total = numero(totalCelda);
      const sub = subtotalesDe(items.map((x) => ({ ...x })));
      return total && sub && Math.abs(total / sub - 1.15) < 0.002 ? 15 : 0;
    })();
    compras.push({
      ref: hoja.trim() + "!" + r0,
      day: fechaDeCelda(celda(cFecha, r0))!,
      document: null,
      notes: null,
      taxPct,
      pagada: clave(cEstado !== undefined ? celda(cEstado, r0) : undefined).startsWith("cancelad"),
      items,
      totalExcel: cTotal !== undefined ? numero(totalCelda) : null,
    });
  }
  // Renglones con datos que no suma ningun total: el Excel no los cuenta, aqui tampoco.
  for (let r = titulos + 1; r <= rango.e.r + 1; r++) {
    const x = renglon(r);
    if (x && x.qty > 0 && !usadas.has(r) && !fechaDeCelda(celda(cFecha, r))) {
      avisos.push(hoja.trim() + ", fila " + r + ": " + x.qty + " " + x.description + " no está en ninguna compra del Excel; no se importó.");
    }
  }
  return compras;
}

/** La hoja PAY: la lista CUENTAS POR PAGAR, y lo que ya se desconto de sus facturas. */
function leerHojaCruce(ws: WorkSheet, hoja: string): { compras: CompraExcel[]; notas: string | null } | null {
  const rango = utils.decode_range(ws["!ref"]!);
  const celda = (c: number, r: number) => ws[col(c) + r];
  let fila = 0;
  let cValor = -1;
  for (let r = rango.s.r + 1; r <= rango.e.r + 1 && !fila; r++) {
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      if (clave(celda(c, r)) === "cuentas por pagar") {
        fila = r;
        cValor = c;
      }
    }
  }
  if (!fila) return null;
  const cFecha = cValor - 1;

  // Lo descontado: las celdas que nombra la formula junto a "DESCONTADO LOS CRÉDITOS",
  // y los valores que esa formula escribe a mano (285 es K13).
  const descontadas = new Set<number>();
  const literales: number[] = [];
  for (let r = rango.s.r + 1; r <= rango.e.r + 1; r++) {
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const f = celda(c, r)?.f;
      if (!f || !/descontad/.test(clave(celda(c + 1, r)))) continue;
      for (const ref of f.toUpperCase().match(/[A-Z]+\d+/g) ?? []) {
        if (utils.decode_cell(ref).c === cValor) descontadas.add(utils.decode_cell(ref).r + 1);
      }
      for (const n of f.split(/[-+]/).slice(1)) if (/^\d+(\.\d+)?$/.test(n.trim())) literales.push(Number(n));
    }
  }

  const compras: CompraExcel[] = [];
  let facturas = 0;
  let porCobrar = 0;
  for (let r = fila + 1; r <= rango.e.r + 1; r++) {
    const valor = numero(celda(cValor, r));
    const saldoFactura = numero(celda(cValor - 3, r));
    if (saldoFactura) {
      facturas++;
      porCobrar += saldoFactura;
    }
    if (!valor) continue;
    const nota = texto(celda(cValor + 1, r));
    const literal = literales.indexOf(valor);
    if (literal >= 0) literales.splice(literal, 1);
    const pagada = descontadas.has(r) || literal >= 0 || /descontad/.test(normalizar(nota));
    compras.push({
      ref: hoja.trim() + "!" + r,
      // Sin fecha en el Excel (la primera de PAY): la del renglon siguiente.
      day: fechaDeCelda(celda(cFecha, r)) ?? fechaDeCelda(celda(cFecha, r + 1)) ?? "2026-01-01",
      document: null,
      notes:
        [nota, pagada ? "Descontado de las facturas a " + hoja.trim() : "", fechaDeCelda(celda(cFecha, r)) ? "" : "Sin fecha en el Excel"]
          .filter(Boolean)
          .join(". ") || null,
      taxPct: 0,
      pagada,
      items: [{ description: "Cuenta por pagar", qty: 1, unitPrice: valor, discount: 0, salePrice: null }],
      totalExcel: valor,
    });
  }
  return {
    compras,
    notas: facturas
      ? "En el Excel: " + facturas + " facturas de Chopo a " + hoja.trim() + " por " + redondear(porCobrar).toFixed(2) + " (eso es por cobrar). Lo que se le debía se fue descontando de ellas."
      : null,
  };
}

export function leerExcelPorPagar(datos: ArrayBuffer | Uint8Array): LibroPorPagar {
  const wb = read(datos, { cellFormula: true, type: "array" });
  const avisos: string[] = [];
  const proveedores: ProveedorExcel[] = [];
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre];
    if (!ws["!ref"] || /^hoja\s?\d+$/i.test(nombre.trim())) continue;
    const cruce = leerHojaCruce(ws, nombre);
    const compras = cruce ? cruce.compras : leerHojaNormal(ws, nombre, avisos);
    for (const c of compras) {
      if (c.totalExcel === null) continue;
      const calculado = totalDe(c.items, c.taxPct);
      if (Math.abs(calculado - c.totalExcel) > 0.011) {
        avisos.push(c.ref + ": la suma da " + calculado.toFixed(2) + " y el Excel dice " + c.totalExcel.toFixed(2) + ".");
      }
    }
    if (!compras.length) avisos.push("La hoja " + nombre.trim() + " no tiene compras; el proveedor queda sin compras.");
    proveedores.push({ nombre: nombre.trim(), hoja: nombre.trim(), notas: cruce?.notas ?? null, compras });
  }
  return { proveedores, avisos };
}
