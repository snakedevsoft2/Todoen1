import { read, utils, type CellObject, type WorkBook, type WorkSheet } from "xlsx";
import { aCentavos, claveDe } from "./reparto";

/**
 * Lee el libro de Excel de reparto ("2026 VENTAS REPARTO ...") tal como lo
 * llevaba Chopo Snacks, para importarlo (ver lib/reparto-importar.ts).
 *
 * Cada hoja es un vendedor y cada dia es un bloque que empieza en la fila que
 * dice "VENDEDOR" en la columna A (el vendedor en B, la fecha en C de la fila
 * siguiente). No se leen filas fijas, porque cambian de una hoja a otra:
 *   - los productos van entre la fila "PRODUCTO" y "TOTAL GENERAL POR VENTAS";
 *   - los creditos, cobros y pagos se leen del rango que suma cada total en la
 *     columna W (el SUM(W..:W..) de su formula), no de filas fijas;
 *   - las cuentas por cobrar copiadas a mano, en las columnas Z a AD.
 * Los totales que el Excel ya calculo se guardan como "esperado", para
 * comprobar que la aplicacion da lo mismo al centavo.
 *
 * Plata en centavos; cantidades enteras.
 */

export type LineaExcel = {
  producto: string;
  carga: number;
  cargaDetalle: string | null;
  devolucion: number;
  precio: number;
  base12: number;
  iva: number;
  unidVendCant: number;
  unidVendValor: number;
  docDescuento: string | null;
  dctoPrecio: number;
  dctoPromocion: number;
  caducadoCant: number;
  devolUnidadesValor: number;
  totalExcel: number;
};

export type MovimientoExcel = {
  fecha: string | null;
  documento: string | null;
  cliente: string | null;
  valor: number;
  factura: string | null;
};

export type PlanillaExcel = {
  hoja: string;
  /** Hoja y fecha original del Excel: la llave para no importarla dos veces. */
  ref: string;
  fecha: string;
  /** Lo que dice la celda VENDEDOR del bloque ("jimy" dentro de la hoja HENRY, por ejemplo). */
  etiqueta: string;
  acompanante: string | null;
  otrosDescuentos: number;
  entregado: number;
  entregadoDetalle: string | null;
  lineas: LineaExcel[];
  creditos: MovimientoExcel[];
  cobros: (MovimientoExcel & { tipo: "COBRO" | "AJUSTE" })[];
  pagos: { documento: string | null; concepto: string; valor: number }[];
  /** La lista "CUENTAS POR COBRAR CLIENTES" de ese dia, como la copiaron. */
  cartera: MovimientoExcel[];
  esperado: {
    ventas: number;
    credito: number;
    contado: number;
    cartera: number;
    recibido: number;
    pagos: number;
    caja: number;
    entregado: number;
    diferencia: number;
  };
};

export type AtrasadaExcel = {
  fecha: string | null;
  documento: string | null;
  cliente: string;
  saldo: number;
  /** La formula con los cargos y abonos, como venia ("48-15+10.8-..."). */
  historial: string | null;
};

export type LibroReparto = {
  planillas: PlanillaExcel[];
  atrasadas: AtrasadaExcel[];
  /** Lo que se salto y por que, para mostrarlo antes de importar. */
  avisos: string[];
};

/**
 * Cabeceras del Excel con la fecha equivocada, y la real. La hoja SÁBADO de
 * octubre 2026 dice 2026-07-02 (era la plantilla) pero sus creditos y cobros
 * son del sabado 3 de octubre. La llave lleva la fecha vieja, asi que no
 * toca a ningun otro libro.
 */
export const FECHAS_CORREGIDAS: Record<string, string> = { "SÁBADO#2026-07-02": "2026-10-03" };

export type OpcionesLectura = {
  /** "HOJA#fecha del Excel" -> fecha real, para cabeceras que traen otra fecha. */
  fechas?: Record<string, string>;
};

// ------------------------------------------------------------------ celdas

const celda = (ws: WorkSheet, col: string, fila: number): CellObject | undefined => ws[col + fila];

function textoDe(c: CellObject | undefined): string {
  if (!c || c.v === undefined || c.v === null) return "";
  return String(c.v).replace(/\s+/g, " ").trim();
}

function numeroDe(c: CellObject | undefined): number {
  if (!c || c.v === undefined || c.v === null || c.v === "") return 0;
  if (typeof c.v === "number") return c.v;
  const n = Number(String(c.v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const centavos = (c: CellObject | undefined) => aCentavos(numeroDe(c)) || 0;
const unidades = (c: CellObject | undefined) => Math.round(numeroDe(c));
const rotulo = (c: CellObject | undefined) => claveDe(textoDe(c));

/** Un numero de serie de Excel (46300) o una fecha escrita (05/10/2026) a "YYYY-MM-DD". */
export function fechaDe(c: CellObject | undefined): string | null {
  if (!c || c.v === undefined || c.v === null || c.v === "") return null;
  if (typeof c.v === "number" && c.v > 20000 && c.v < 80000) {
    return new Date(Math.round((c.v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  if (c.v instanceof Date) return c.v.toISOString().slice(0, 10);
  const m = String(c.v).trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : null;
}

/** La formula de una casilla si es una suma escrita a mano ("105+55"), no una que lee otras celdas. */
function detalleDe(c: CellObject | undefined): string | null {
  const f = c?.f?.replace(/^=/, "").trim();
  return f && /^[\d.+\-\s]+$/.test(f) && /\d[+-]\d/.test(f) ? f.replace(/\s/g, "") : null;
}

/** Las celdas que nombra una formula: "+W6-W22" -> ["W6", "W22"]. */
const referencias = (f: string | undefined) => (f ?? "").toUpperCase().match(/\$?[A-Z]{1,3}\$?\d+/g)?.map((r) => r.replace(/\$/g, "")) ?? [];

/** Las filas que suma una formula SUM(W10:W20). */
function filasDeSuma(f: string | undefined): [number, number] | null {
  const m = (f ?? "").toUpperCase().match(/SUM\(\$?[A-Z]+\$?(\d+):\$?[A-Z]+\$?(\d+)\)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

const filaDe = (ref: string) => Number(ref.replace(/^[A-Z]+/, ""));

// ------------------------------------------------------------------ bloques

/** Las hojas que no son de un vendedor: el consolidado, las cuentas atrasadas y las plantillas VEND4/VEND5. */
function esHojaDeVendedor(nombre: string): boolean {
  const n = claveDe(nombre);
  return !n.startsWith("consolid") && !n.includes("atrasad") && !/^vend\s?\d+$/.test(n);
}

function leerBloque(
  ws: WorkSheet,
  hoja: string,
  inicio: number,
  fin: number,
  opciones: OpcionesLectura,
  avisos: string[]
): PlanillaExcel | null {
  const etiqueta = textoDe(celda(ws, "B", inicio));
  const fechaExcel = fechaDe(celda(ws, "C", inicio + 1));
  if (!fechaExcel) {
    avisos.push(hoja + ", fila " + inicio + ": el bloque no tiene fecha y se salto.");
    return null;
  }
  const ref = hoja.trim() + "#" + fechaExcel;
  const fecha = opciones.fechas?.[ref] ?? fechaExcel;

  // Las filas del bloque que tienen un rotulo en una columna.
  const filas: number[] = [];
  for (let r = inicio; r <= fin; r++) filas.push(r);
  const buscar = (col: string, empieza: string) => filas.find((r) => rotulo(celda(ws, col, r)).startsWith(empieza));

  // ---- productos
  const desdeProd = buscar("B", "producto");
  const hastaProd = buscar("B", "total general por ventas");
  const lineas: LineaExcel[] = [];
  if (desdeProd && hastaProd) {
    for (let r = desdeProd + 1; r < hastaProd; r++) {
      const producto = textoDe(celda(ws, "B", r));
      if (!producto) continue;
      const linea: LineaExcel = {
        producto,
        carga: unidades(celda(ws, "C", r)),
        cargaDetalle: detalleDe(celda(ws, "C", r)),
        devolucion: unidades(celda(ws, "D", r)),
        precio: centavos(celda(ws, "F", r)),
        base12: centavos(celda(ws, "H", r)),
        iva: centavos(celda(ws, "I", r)),
        unidVendCant: unidades(celda(ws, "J", r)),
        unidVendValor: centavos(celda(ws, "K", r)),
        docDescuento: textoDe(celda(ws, "L", r)) || null,
        dctoPrecio: centavos(celda(ws, "M", r)),
        dctoPromocion: centavos(celda(ws, "N", r)),
        caducadoCant: unidades(celda(ws, "O", r)),
        devolUnidadesValor: centavos(celda(ws, "Q", r)),
        totalExcel: centavos(celda(ws, "R", r)),
      };
      const mueve =
        linea.carga || linea.devolucion || linea.unidVendValor || linea.dctoPrecio || linea.dctoPromocion || linea.caducadoCant || linea.devolUnidadesValor;
      if (mueve) lineas.push(linea);
    }
  }
  const filaOtros = buscar("L", "otros descuentos");
  const otrosDescuentos = filaOtros ? centavos(celda(ws, "R", filaOtros)) : 0;

  // ---- cuadre: los totales en W, por su rotulo en T
  const w = (r: number | undefined) => (r ? celda(ws, "W", r) : undefined);
  const filaVentas = buscar("T", "total ventas diaria");
  const filaContado = buscar("T", "total ventas contado");
  const filaRecibido = buscar("T", "total efectivo recibido");
  const filaPagos = buscar("T", "total pagos y desembolsos");
  const filaCaja = buscar("T", "total efectivo caja");
  const filaEntregado = buscar("T", "total efectivo entregado");
  const filaDif = buscar("T", "total sobrante");

  // El total de credito es la celda que resta "TOTAL VENTAS CONTADO" (+W6-W22),
  // y el de cartera la que suma "TOTAL EFECTIVO RECIBIDO" (+W24+W41).
  const refCredito = referencias(w(filaContado)?.f)[1] ?? null;
  const filaCredito = refCredito ? filaDe(refCredito) : buscar("T", "total ventas credito");
  const refCartera = referencias(w(filaRecibido)?.f)[1] ?? null;
  const filaCartera = refCartera ? filaDe(refCartera) : buscar("T", "total recaudacion cartera");

  const movimientos = (filaTotal: number | undefined): MovimientoExcel[] => {
    const rango = filasDeSuma(w(filaTotal)?.f);
    if (!rango) return [];
    const salida: MovimientoExcel[] = [];
    for (let r = rango[0]; r <= rango[1]; r++) {
      const valor = centavos(celda(ws, "W", r));
      const cliente = textoDe(celda(ws, "V", r)) || null;
      if (!valor && !cliente) continue;
      salida.push({
        fecha: fechaDe(celda(ws, "T", r)),
        documento: textoDe(celda(ws, "U", r)) || null,
        cliente,
        valor,
        factura: textoDe(celda(ws, "X", r)) || null,
      });
    }
    return salida;
  };

  const creditos = movimientos(filaCredito);
  const cobros = movimientos(filaCartera).map((m) => {
    // "DIF A FAVOR" es un ajuste, no el cobro de un documento, y tambien suma.
    const ajuste = [m.cliente, m.documento, m.factura].some((t) => /^dif\b.*favor/.test(claveDe(t ?? "")));
    return { ...m, tipo: ajuste ? ("AJUSTE" as const) : ("COBRO" as const) };
  });

  const pagos: PlanillaExcel["pagos"] = [];
  const rangoPagos = filasDeSuma(w(filaPagos)?.f);
  if (rangoPagos) {
    for (let r = rangoPagos[0]; r <= rangoPagos[1]; r++) {
      const valor = centavos(celda(ws, "W", r));
      const concepto = textoDe(celda(ws, "U", r));
      if (!valor && !concepto) continue;
      pagos.push({ documento: textoDe(celda(ws, "T", r)) || null, concepto: concepto || "Sin concepto", valor });
    }
  }

  const entregadoCelda = w(filaEntregado);
  const acompanante =
    filaEntregado && rotulo(celda(ws, "X", filaEntregado)).startsWith("acompa")
      ? textoDe(celda(ws, "X", filaEntregado + 1)) || textoDe(celda(ws, "Y", filaEntregado)) || null
      : null;

  const cartera: MovimientoExcel[] = [];
  for (const r of filas) {
    const fechaC = fechaDe(celda(ws, "Z", r));
    const valor = centavos(celda(ws, "AC", r));
    if (!fechaC || !valor) continue;
    cartera.push({
      fecha: fechaC,
      documento: textoDe(celda(ws, "AA", r)) || null,
      cliente: textoDe(celda(ws, "AB", r)) || null,
      valor,
      factura: null,
    });
  }

  const planilla: PlanillaExcel = {
    hoja: hoja.trim(),
    ref,
    fecha,
    etiqueta,
    acompanante,
    otrosDescuentos,
    entregado: centavos(entregadoCelda),
    entregadoDetalle: detalleDe(entregadoCelda),
    lineas,
    creditos,
    cobros,
    pagos,
    cartera,
    esperado: {
      ventas: centavos(w(filaVentas)),
      credito: centavos(w(filaCredito)),
      contado: centavos(w(filaContado)),
      cartera: centavos(w(filaCartera)),
      recibido: centavos(w(filaRecibido)),
      pagos: centavos(w(filaPagos)),
      caja: centavos(w(filaCaja)),
      entregado: centavos(entregadoCelda),
      diferencia: centavos(w(filaDif)),
    },
  };

  // Una plantilla sin nada (ni productos, ni plata, ni entrega) no es un dia de trabajo.
  const vacia =
    !lineas.length && !creditos.length && !cobros.length && !pagos.length && !planilla.entregado;
  if (vacia) {
    avisos.push(hoja + " " + fecha + ": bloque vacío, se saltó.");
    return null;
  }
  return planilla;
}

function leerHoja(ws: WorkSheet, hoja: string, opciones: OpcionesLectura, avisos: string[]): PlanillaExcel[] {
  if (!ws["!ref"]) return [];
  const rango = utils.decode_range(ws["!ref"]);
  const inicios: number[] = [];
  for (let r = rango.s.r + 1; r <= rango.e.r + 1; r++) {
    if (rotulo(celda(ws, "A", r)).startsWith("vendedor") && textoDe(celda(ws, "B", r))) inicios.push(r);
  }
  return inicios.flatMap((inicio, i) => {
    const fin = (inicios[i + 1] ?? rango.e.r + 2) - 1;
    const p = leerBloque(ws, hoja, inicio, fin, opciones, avisos);
    return p ? [p] : [];
  });
}

/** La hoja "CUENTAS ATRASADAS": fecha, documento, cliente y saldo con su historial. */
function leerAtrasadas(ws: WorkSheet): AtrasadaExcel[] {
  if (!ws["!ref"]) return [];
  const rango = utils.decode_range(ws["!ref"]);
  const salida: AtrasadaExcel[] = [];
  for (let r = rango.s.r + 1; r <= rango.e.r + 1; r++) {
    const cliente = textoDe(celda(ws, "C", r));
    const saldo = centavos(celda(ws, "D", r));
    if (!cliente || !saldo) continue;
    salida.push({
      fecha: fechaDe(celda(ws, "A", r)),
      documento: textoDe(celda(ws, "B", r)) || null,
      cliente,
      saldo,
      historial: celda(ws, "D", r)?.f?.replace(/^=/, "") ?? null,
    });
  }
  return salida;
}

/** El archivo .xlsx tal como se sube. Las formulas hacen falta: de ellas salen los rangos y los detalles. */
export function leerExcelReparto(datos: ArrayBuffer | Uint8Array, opciones: OpcionesLectura = {}): LibroReparto {
  return leerLibroReparto(read(datos, { cellFormula: true, type: "array" }), opciones);
}

export function leerLibroReparto(wb: WorkBook, opciones: OpcionesLectura = {}): LibroReparto {
  const avisos: string[] = [];
  const planillas: PlanillaExcel[] = [];
  const atrasadas: AtrasadaExcel[] = [];
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre];
    if (claveDe(nombre).includes("atrasad")) atrasadas.push(...leerAtrasadas(ws));
    else if (esHojaDeVendedor(nombre)) planillas.push(...leerHoja(ws, nombre, opciones, avisos));
    else avisos.push("La hoja " + nombre.trim() + " no es de un vendedor y no se importa (el consolidado se calcula solo).");
  }
  return { planillas, atrasadas, avisos };
}
