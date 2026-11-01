import { redondear } from "../impuestos";
import { CODIGO_TARIFA_SRI } from "../paises";
import type { TipoComprobante } from "./clave";

/**
 * Los XML de los comprobantes del SRI (ficha tecnica, esquema offline).
 *
 * Se escriben ya en forma canonica (C14N): sin espacios entre etiquetas, sin
 * etiquetas que se cierran solas, atributos en orden y los caracteres
 * escapados como los escapa la canonicalizacion. Asi el texto que se firma es
 * exactamente el que el SRI vuelve a calcular al verificar la firma; si no
 * coincidieran, la devuelve con "FIRMA INVALIDA".
 *
 * El orden de los elementos es el del XSD de cada comprobante: el SRI rechaza
 * uno fuera de lugar aunque este bien escrito.
 */

/** Texto de un elemento: sin caracteres de control, en una sola linea. */
function escTexto(v: string): string {
  return v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAtributo(v: string): string {
  return escTexto(v).replace(/"/g, "&quot;");
}

type Contenido = string | number | null | undefined | false | Contenido[];

function plano(c: Contenido): string {
  if (Array.isArray(c)) return c.map(plano).join("");
  if (c === null || c === undefined || c === false) return "";
  return String(c);
}

/** Un elemento con hijos ya armados. Sin hijos no se escribe: asi se omiten los opcionales. */
export function el(nombre: string, hijos: Contenido, atributos?: Record<string, string>): string {
  const dentro = plano(hijos);
  if (!dentro) return "";
  const attrs = atributos
    ? Object.keys(atributos)
        .sort()
        .map((k) => " " + k + '="' + escAtributo(atributos[k]) + '"')
        .join("")
    : "";
  return "<" + nombre + attrs + ">" + dentro + "</" + nombre + ">";
}

/** Un elemento de texto. Vacio no se escribe (los obligatorios se revisan antes). */
export function txt(nombre: string, valor: string | number | null | undefined, atributos?: Record<string, string>): string {
  if (valor === null || valor === undefined) return "";
  const v = typeof valor === "number" ? String(valor) : escTexto(valor);
  return v ? el(nombre, v, atributos) : "";
}

/** Dos decimales, como piden los totales. */
export const dec2 = (n: number) => redondear(n, 2).toFixed(2);

/** Hasta seis decimales y al menos dos (cantidad y precio unitario). */
export function dec6(n: number): string {
  const s = redondear(n, 6).toFixed(6).replace(/0+$/, "");
  const [entero, decimales = ""] = s.split(".");
  return entero + "." + decimales.padEnd(2, "0");
}

/** "2026-10-31" a "31/10/2026". */
export const fechaSri = (dia: string) => dia.split("-").reverse().join("/");

export type Regimen = "GENERAL" | "RIMPE_EMPRENDEDOR" | "RIMPE_NEGOCIO_POPULAR";

/** Lo que va en <contribuyenteRimpe>, segun la resolucion NAC-DGERCGC22-00000013. */
const LEYENDA_RIMPE: Record<Regimen, string | null> = {
  GENERAL: null,
  RIMPE_EMPRENDEDOR: "CONTRIBUYENTE RÉGIMEN RIMPE",
  RIMPE_NEGOCIO_POPULAR: "CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE",
};

export type EmisorSri = {
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  dirMatriz: string;
  dirEstablecimiento: string;
  establecimiento: string;
  puntoEmision: string;
  obligadoContabilidad: boolean;
  /** Numero de resolucion, si es contribuyente especial. */
  contribuyenteEspecial: string | null;
  /** Numero de resolucion, si es agente de retencion. */
  agenteRetencion: string | null;
  regimen: Regimen;
};

export type Cabecera = {
  ambiente: "pruebas" | "produccion";
  tipo: TipoComprobante;
  secuencial: number;
  clave: string;
  emisor: EmisorSri;
};

export function infoTributaria(c: Cabecera): string {
  const e = c.emisor;
  return el("infoTributaria", [
    txt("ambiente", c.ambiente === "produccion" ? "2" : "1"),
    txt("tipoEmision", "1"),
    txt("razonSocial", e.razonSocial),
    txt("nombreComercial", e.nombreComercial),
    txt("ruc", e.ruc),
    txt("claveAcceso", c.clave),
    txt("codDoc", c.tipo),
    txt("estab", e.establecimiento),
    txt("ptoEmi", e.puntoEmision),
    txt("secuencial", String(c.secuencial).padStart(9, "0")),
    txt("dirMatriz", e.dirMatriz),
    txt("agenteRetencion", e.agenteRetencion),
    txt("contribuyenteRimpe", LEYENDA_RIMPE[e.regimen]),
  ]);
}

/** Lo que va despues del establecimiento en casi todos los comprobantes. */
function contribuyente(e: EmisorSri): string {
  return txt("contribuyenteEspecial", e.contribuyenteEspecial) + txt("obligadoContabilidad", e.obligadoContabilidad ? "SI" : "NO");
}

export type CompradorSri = {
  /** Tabla 6: 04 RUC, 05 cedula, 06 pasaporte, 07 consumidor final, 08 del exterior. */
  tipoIdentificacion: string;
  identificacion: string;
  razonSocial: string;
  direccion?: string | null;
  correo?: string | null;
  telefono?: string | null;
};

export const CONSUMIDOR_FINAL: CompradorSri = { tipoIdentificacion: "07", identificacion: "9999999999999", razonSocial: "CONSUMIDOR FINAL" };

export type LineaSri = {
  codigo: string;
  descripcion: string;
  cantidad: number;
  /** Sin IVA, hasta seis decimales. */
  precioUnitario: number;
  descuento: number;
  /** cantidad × precio − descuento, a dos decimales. */
  base: number;
  tarifa: number;
  iva: number;
};

export type TotalTarifa = { codigoPorcentaje: string; tarifa: number; base: number; valor: number };

export function codigoPorcentaje(tarifa: number): string {
  const c = CODIGO_TARIFA_SRI[tarifa];
  if (!c) throw new Error("El SRI no tiene una tarifa de IVA del " + tarifa + "%.");
  return c;
}

/** El IVA de los renglones, sumado por tarifa (como va en totalConImpuestos). */
export function totalesPorTarifa(lineas: LineaSri[]): TotalTarifa[] {
  const porTarifa = new Map<number, TotalTarifa>();
  for (const l of lineas) {
    const t = porTarifa.get(l.tarifa) ?? { codigoPorcentaje: codigoPorcentaje(l.tarifa), tarifa: l.tarifa, base: 0, valor: 0 };
    t.base = redondear(t.base + l.base, 2);
    t.valor = redondear(t.valor + l.iva, 2);
    porTarifa.set(l.tarifa, t);
  }
  return [...porTarifa.values()];
}

export function sumaComprobante(lineas: LineaSri[]) {
  const tarifas = totalesPorTarifa(lineas);
  const base = redondear(tarifas.reduce((s, t) => s + t.base, 0), 2);
  const iva = redondear(tarifas.reduce((s, t) => s + t.valor, 0), 2);
  const descuento = redondear(lineas.reduce((s, l) => s + l.descuento, 0), 2);
  return { tarifas, base, iva, descuento, total: redondear(base + iva, 2) };
}

function impuestosDeLinea(l: LineaSri): string {
  return el(
    "impuestos",
    el("impuesto", [
      txt("codigo", "2"),
      txt("codigoPorcentaje", codigoPorcentaje(l.tarifa)),
      txt("tarifa", dec2(l.tarifa)),
      txt("baseImponible", dec2(l.base)),
      txt("valor", dec2(l.iva)),
    ])
  );
}

function totalConImpuestos(tarifas: TotalTarifa[]): string {
  return el(
    "totalConImpuestos",
    tarifas.map((t) =>
      el("totalImpuesto", [txt("codigo", "2"), txt("codigoPorcentaje", t.codigoPorcentaje), txt("baseImponible", dec2(t.base)), txt("valor", dec2(t.valor))])
    )
  );
}

export type Adicional = { nombre: string; valor: string };

/** Hasta 15 campos de 300 caracteres; los vacios no van. */
function infoAdicional(campos: Adicional[]): string {
  const validos = campos.filter((c) => c.valor && c.valor.trim()).slice(0, 15);
  return el(
    "infoAdicional",
    validos.map((c) => txt("campoAdicional", c.valor.slice(0, 300), { nombre: c.nombre }))
  );
}

/** Los datos del comprador que van en infoAdicional (el RIDE y el correo los usan). */
export function adicionalesComprador(c: CompradorSri): Adicional[] {
  return [
    { nombre: "Email", valor: c.correo ?? "" },
    { nombre: "Teléfono", valor: c.telefono ?? "" },
  ];
}

/** Tabla 24: formas de pago. */
export const FORMA_PAGO: Record<string, string> = {
  "01": "Sin utilización del sistema financiero",
  "15": "Compensación de deudas",
  "16": "Tarjeta de débito",
  "17": "Dinero electrónico",
  "18": "Tarjeta prepago",
  "19": "Tarjeta de crédito",
  "20": "Otros con utilización del sistema financiero",
  "21": "Endoso de títulos",
};

export type PagoSri = { formaPago: string; total: number; plazo?: number; unidadTiempo?: string };

// ------------------------------------------------------------------ factura

export type FacturaSri = Cabecera & {
  /** "YYYY-MM-DD" en Ecuador. */
  fecha: string;
  comprador: CompradorSri;
  lineas: LineaSri[];
  pagos: PagoSri[];
  adicionales?: Adicional[];
};

/** Factura, version 1.1.0 (codDoc 01). */
export function facturaXml(f: FacturaSri): string {
  const s = sumaComprobante(f.lineas);
  const c = f.comprador;
  const cuerpo = el(
    "factura",
    [
      infoTributaria(f),
      el("infoFactura", [
        txt("fechaEmision", fechaSri(f.fecha)),
        txt("dirEstablecimiento", f.emisor.dirEstablecimiento),
        contribuyente(f.emisor),
        txt("tipoIdentificacionComprador", c.tipoIdentificacion),
        txt("razonSocialComprador", c.razonSocial),
        txt("identificacionComprador", c.identificacion),
        txt("direccionComprador", c.direccion),
        txt("totalSinImpuestos", dec2(s.base)),
        txt("totalDescuento", dec2(s.descuento)),
        totalConImpuestos(s.tarifas),
        txt("propina", "0.00"),
        txt("importeTotal", dec2(s.total)),
        txt("moneda", "DOLAR"),
        el(
          "pagos",
          f.pagos.map((p) =>
            el("pago", [
              txt("formaPago", p.formaPago),
              txt("total", dec2(p.total)),
              p.plazo ? txt("plazo", p.plazo) : "",
              p.plazo ? txt("unidadTiempo", p.unidadTiempo ?? "dias") : "",
            ])
          )
        ),
      ]),
      el(
        "detalles",
        f.lineas.map((l) =>
          el("detalle", [
            txt("codigoPrincipal", l.codigo),
            txt("descripcion", l.descripcion),
            txt("cantidad", dec6(l.cantidad)),
            txt("precioUnitario", dec6(l.precioUnitario)),
            txt("descuento", dec2(l.descuento)),
            txt("precioTotalSinImpuesto", dec2(l.base)),
            impuestosDeLinea(l),
          ])
        )
      ),
      infoAdicional([...adicionalesComprador(c), ...(f.adicionales ?? [])]),
    ],
    { id: "comprobante", version: "1.1.0" }
  );
  return '<?xml version="1.0" encoding="UTF-8"?>' + cuerpo;
}
