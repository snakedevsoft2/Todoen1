import type { BillingConfig, ElectronicInvoice, Prisma } from "@prisma/client";
import { db } from "../db";
import { falla, type Resultado, type Sesion } from "../informes";
import { cifrar, descifrar } from "./cifrado";
import { lineasFiscales, totalEnMoneda, type LineaVenta } from "./impuestos";
import { TARIFAS, datosPais, esPais, leerComprador, type Comprador, type Pais } from "./paises";
import { consultarFactus, credencialesFactusCompletas, emitirFactus, probarFactus, type RangoFactus } from "./factus";
import { consultarDatil, credencialesDatilCompletas, emitirDatil, numeroSri, probarDatil } from "./datil";
import type { Ambiente, ResultadoProveedor } from "./tipos";

/**
 * La factura autorizada: configurarla, emitirla y seguirla hasta que la
 * entidad responda.
 *
 * Una venta sale siempre con su factura normal. La autorizada es aparte y la
 * pide quien vende, cuando el negocio esta obligado o el cliente la necesita.
 * Si el proveedor no contesta, la factura queda con error y se reintenta sola;
 * si la entidad la rechaza, queda con el motivo para corregir y reintentar.
 */

// ------------------------------------------------------------ configuracion

/** Lo que ve la pantalla. Nunca lleva las credenciales, solo si estan guardadas. */
export type ConfigVista = {
  enabled: boolean;
  country: Pais;
  environment: Ambiente;
  defaultDocument: "normal" | "autorizada";
  taxKey: string;
  numberingRangeId: string;
  taxId: string;
  legalName: string;
  tradeName: string;
  fiscalAddress: string;
  establishment: string;
  emissionPoint: string;
  nextSequential: number;
  keepsAccounting: boolean;
  specialTaxpayer: string;
  credencialesGuardadas: boolean;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
};

const CAMPOS_CREDENCIALES: Record<Pais, string[]> = {
  CO: ["clientId", "clientSecret", "username", "password"],
  EC: ["apiKey", "certPassword"],
};

function credencialesCompletas(pais: Pais, c: Record<string, string> | null): boolean {
  return pais === "CO" ? credencialesFactusCompletas(c) : credencialesDatilCompletas(c);
}

function vista(c: BillingConfig | null): ConfigVista {
  const pais: Pais = esPais(c?.country) ? c.country : "CO";
  const tarifa = TARIFAS[pais].find((t) => t.codigo === c?.taxCode && t.tarifa === c?.taxRate) ?? TARIFAS[pais][0];
  return {
    enabled: c?.enabled ?? false,
    country: pais,
    environment: c?.environment === "produccion" ? "produccion" : "pruebas",
    defaultDocument: c?.defaultDocument === "autorizada" ? "autorizada" : "normal",
    taxKey: tarifa.value,
    numberingRangeId: c?.numberingRangeId ?? "",
    taxId: c?.taxId ?? "",
    legalName: c?.legalName ?? "",
    tradeName: c?.tradeName ?? "",
    fiscalAddress: c?.fiscalAddress ?? "",
    establishment: c?.establishment ?? "001",
    emissionPoint: c?.emissionPoint ?? "001",
    nextSequential: c?.nextSequential ?? 1,
    keepsAccounting: c?.keepsAccounting ?? false,
    specialTaxpayer: c?.specialTaxpayer ?? "",
    credencialesGuardadas: credencialesCompletas(pais, descifrar(c?.credentials)),
    lastCheckAt: c?.lastCheckAt?.toISOString() ?? null,
    lastCheckOk: c?.lastCheckOk ?? null,
    lastCheckMessage: c?.lastCheckMessage ?? null,
  };
}

export async function configuracionFacturacion(userId: string): Promise<ConfigVista> {
  return vista(await db.billingConfig.findUnique({ where: { userId } }));
}

/** Lo que falta para poder emitir. Vacio si esta lista. */
export function faltantes(c: ConfigVista): string[] {
  const falta: string[] = [];
  if (!c.credencialesGuardadas) falta.push("las credenciales de " + datosPais(c.country).proveedor);
  if (c.country === "EC") {
    if (!/^\d{13}$/.test(c.taxId)) falta.push("el RUC del negocio (13 dígitos)");
    if (!c.legalName) falta.push("la razón social");
    if (!c.fiscalAddress) falta.push("la dirección de la matriz");
  }
  return falta;
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function guardarConfiguracion(userId: string, d: Record<string, unknown>): Promise<Resultado<ConfigVista>> {
  const pais = d.country;
  if (!esPais(pais)) return falla("Elige el país.");
  const tarifa = TARIFAS[pais].find((t) => t.value === d.taxKey);
  if (!tarifa) return falla("Elige el impuesto de tus ventas.");
  const establishment = texto(d.establishment, 3) || "001";
  const emissionPoint = texto(d.emissionPoint, 3) || "001";
  if (pais === "EC" && (!/^\d{3}$/.test(establishment) || !/^\d{3}$/.test(emissionPoint))) {
    return falla("El establecimiento y el punto de emisión son de tres dígitos, como 001.");
  }
  const secuencial = Math.round(Number(d.nextSequential ?? 1));
  if (!Number.isFinite(secuencial) || secuencial < 1 || secuencial > 999_999_999) return falla("El siguiente número de factura no es válido.");
  const rango = texto(d.numberingRangeId, 12);
  if (rango && !/^\d+$/.test(rango)) return falla("El rango de numeración es un número.");

  const actual = await db.billingConfig.findUnique({ where: { userId } });
  // Las credenciales que no se escriben se quedan como estaban: la pantalla
  // nunca las muestra, asi que dejar el campo vacio es "no cambiar".
  const previas = actual?.country === pais ? descifrar(actual.credentials) ?? {} : {};
  const nuevas: Record<string, string> = { ...previas };
  for (const campo of CAMPOS_CREDENCIALES[pais]) {
    const valor = texto(d[campo], 300);
    if (valor) nuevas[campo] = valor;
  }
  const guardar = CAMPOS_CREDENCIALES[pais].some((k) => nuevas[k]) ? cifrar(nuevas) : null;

  const datos = {
    country: pais,
    environment: d.environment === "produccion" ? "produccion" : "pruebas",
    defaultDocument: d.defaultDocument === "autorizada" ? "autorizada" : "normal",
    taxCode: tarifa.codigo,
    taxRate: tarifa.tarifa,
    numberingRangeId: rango || null,
    taxId: texto(d.taxId, 13).replace(/\D/g, "") || null,
    legalName: texto(d.legalName, 300) || null,
    tradeName: texto(d.tradeName, 300) || null,
    fiscalAddress: texto(d.fiscalAddress, 300) || null,
    establishment,
    emissionPoint,
    nextSequential: secuencial,
    keepsAccounting: d.keepsAccounting === true || d.keepsAccounting === "on",
    specialTaxpayer: texto(d.specialTaxpayer, 13) || null,
    credentials: guardar,
  };

  const enabled = d.enabled === true || d.enabled === "on";
  const borrador = vista({ ...(actual ?? ({} as BillingConfig)), ...datos, enabled } as BillingConfig);
  const falta = faltantes(borrador);
  if (enabled && falta.length > 0) return falla("Para activarla falta " + falta.join(", ") + ".");

  // Si cambian las credenciales o el pais, la ultima prueba ya no dice nada.
  const cambioConexion = guardar !== actual?.credentials || pais !== actual?.country || datos.environment !== actual?.environment;
  const guardada = await db.billingConfig.upsert({
    where: { userId },
    create: { userId, ...datos, enabled },
    update: { ...datos, enabled, ...(cambioConexion ? { lastCheckAt: null, lastCheckOk: null, lastCheckMessage: null } : {}) },
  });
  return { ok: true, datos: vista(guardada) };
}

export async function probarConexion(
  userId: string
): Promise<{ ok: boolean; mensaje: string; rangos?: RangoFactus[] }> {
  const c = await db.billingConfig.findUnique({ where: { userId } });
  const pais: Pais = esPais(c?.country) ? c.country : "CO";
  const creds = descifrar(c?.credentials);
  let r: { ok: boolean; mensaje: string; rangos?: RangoFactus[] };
  if (!c || !credencialesCompletas(pais, creds)) {
    r = { ok: false, mensaje: "Primero guarda las credenciales de " + datosPais(pais).proveedor + "." };
  } else if (pais === "CO" && credencialesFactusCompletas(creds)) {
    const p = await probarFactus(creds, c.environment === "produccion" ? "produccion" : "pruebas");
    r = p.ok
      ? {
          ok: true,
          mensaje: p.rangos.length ? "Conectado con Factus. Rangos activos: " + p.rangos.length + "." : "Conectado con Factus, pero no tienes rangos de numeración activos.",
          rangos: p.rangos,
        }
      : { ok: false, mensaje: p.mensaje };
  } else if (credencialesDatilCompletas(creds)) {
    const p = await probarDatil(creds);
    r = p.ok ? { ok: true, mensaje: "Conectado con Dátil." } : { ok: false, mensaje: p.mensaje };
  } else {
    r = { ok: false, mensaje: "Faltan credenciales." };
  }
  if (c) {
    await db.billingConfig.update({
      where: { userId },
      data: { lastCheckAt: new Date(), lastCheckOk: r.ok, lastCheckMessage: r.mensaje.slice(0, 300) },
    });
  }
  return r;
}

// ------------------------------------------------------------------ emision

export type FacturaVista = {
  id: string;
  saleId: string;
  estado: "ENVIANDO" | "AUTORIZADA" | "RECHAZADA" | "ERROR";
  pais: Pais;
  ambiente: Ambiente;
  numero: string | null;
  codigo: string | null;
  etiquetaCodigo: string;
  qrUrl: string | null;
  publicUrl: string | null;
  mensaje: string | null;
  autorizadaEn: string | null;
  comprador: Comprador;
  subtotal: number;
  impuesto: number;
  total: number;
};

export function facturaVista(f: ElectronicInvoice): FacturaVista {
  const pais: Pais = esPais(f.country) ? f.country : "CO";
  return {
    id: f.id,
    saleId: f.saleId,
    estado: f.status,
    pais,
    ambiente: f.environment === "produccion" ? "produccion" : "pruebas",
    numero: f.number,
    codigo: f.authCode,
    etiquetaCodigo: pais === "CO" ? "CUFE" : "Clave de acceso",
    qrUrl: f.qrUrl,
    publicUrl: f.publicUrl,
    mensaje: f.message,
    autorizadaEn: f.authorizedAt?.toISOString() ?? null,
    comprador: f.customer as unknown as Comprador,
    subtotal: f.subtotal,
    impuesto: f.tax,
    total: f.total,
  };
}

/** Un envio que se quedo "enviando" mas de esto se da por caido y se retoma. */
const ENVIO_CAIDO_MS = 2 * 60_000;

/** Pide la factura autorizada de una venta. Si ya la tenia, la devuelve. */
export async function emitirFactura(s: Sesion, saleId: string, compradorCrudo: unknown): Promise<Resultado<FacturaVista>> {
  const config = await db.billingConfig.findUnique({ where: { userId: s.user.id } });
  if (!config?.enabled) return falla("La factura autorizada no está activada. Actívala en Ajustes.");
  const pais: Pais = esPais(config.country) ? config.country : "CO";
  const moneda = datosPais(pais).moneda;
  if (s.user.currency !== moneda) {
    return falla("La factura de " + datosPais(pais).label + " va en " + moneda + " y tu negocio está en " + s.user.currency + ". Cambia la moneda en Ajustes.");
  }

  const venta = await db.sale.findFirst({
    where: { id: saleId, userId: s.user.id },
    include: { items: true, electronicInvoice: true },
  });
  if (!venta) return falla("No encontramos esa venta.", 404);

  const previa = venta.electronicInvoice;
  const recienEnviada = previa?.status === "ENVIANDO" && Date.now() - previa.updatedAt.getTime() < ENVIO_CAIDO_MS;
  if (previa && (previa.status === "AUTORIZADA" || recienEnviada)) return { ok: true, datos: facturaVista(previa) };

  const leido = leerComprador(pais, compradorCrudo, totalEnMoneda(venta.total, moneda));
  if (!leido.ok) return falla(leido.error);

  // Los renglones con su precio de venta. Si la venta tuvo descuento (una
  // cuenta cerrada con rebaja), se reparte en los renglones para que la
  // factura sume lo que de verdad se cobro.
  const suma = venta.items.reduce((t, i) => t + i.unitPrice * i.qty, 0);
  const lineasVenta: LineaVenta[] =
    venta.items.length === 0 || suma <= 0
      ? [{ name: "Venta", qty: 1, unitPrice: venta.total }]
      : venta.items.map((i) => ({ name: i.name + (i.variantLabel && !i.name.includes(i.variantLabel) ? " (" + i.variantLabel + ")" : ""), qty: i.qty, unitPrice: (i.unitPrice * venta.total) / suma }));
  const { totales } = lineasFiscales(lineasVenta, moneda, config.taxRate, 2);

  const datosFila = {
    customer: leido.comprador as unknown as Prisma.InputJsonValue,
    subtotal: totales.base,
    tax: totales.impuesto,
    total: totales.total,
    country: pais,
    environment: config.environment,
    createdByStaffId: s.staff.id,
  };

  // Se aparta la factura antes de mandarla: dos toques seguidos o dos
  // pantallas abiertas no pueden emitir dos veces la misma venta.
  let fila: ElectronicInvoice | null;
  if (!previa) {
    try {
      fila = await db.electronicInvoice.create({ data: { userId: s.user.id, saleId: venta.id, status: "ENVIANDO", ...datosFila } });
    } catch (e) {
      if ((e as { code?: string })?.code !== "P2002") throw e;
      const otra = await db.electronicInvoice.findUnique({ where: { saleId: venta.id } });
      return otra ? { ok: true, datos: facturaVista(otra) } : falla("No se pudo apartar la factura.", 409);
    }
  } else {
    const apartada = await db.electronicInvoice.updateMany({
      where: {
        id: previa.id,
        OR: [{ status: { in: ["ERROR", "RECHAZADA"] } }, { status: "ENVIANDO", updatedAt: { lt: new Date(Date.now() - ENVIO_CAIDO_MS) } }],
      },
      data: { status: "ENVIANDO", attempts: { increment: 1 }, message: null, ...datosFila },
    });
    fila = await db.electronicInvoice.findUnique({ where: { id: previa.id } });
    if (apartada.count === 0 && fila) return { ok: true, datos: facturaVista(fila) };
  }
  if (!fila) return falla("No se pudo apartar la factura.", 409);

  return { ok: true, datos: facturaVista(await procesar(fila.id)) };
}

/** Le pone el resultado del proveedor a la fila. */
async function aplicar(id: string, r: ResultadoProveedor): Promise<ElectronicInvoice> {
  switch (r.estado) {
    case "AUTORIZADA":
      return db.electronicInvoice.update({
        where: { id },
        data: {
          status: "AUTORIZADA",
          number: r.numero,
          authCode: r.codigo,
          qrUrl: r.qr,
          publicUrl: r.publicUrl,
          providerId: r.providerId,
          authorizedAt: r.fecha ?? new Date(),
          message: null,
        },
      });
    case "ENVIANDO":
      return db.electronicInvoice.update({
        where: { id },
        data: {
          status: "ENVIANDO",
          ...(r.numero ? { number: r.numero } : {}),
          ...(r.codigo ? { authCode: r.codigo } : {}),
          ...(r.providerId ? { providerId: r.providerId } : {}),
          message: r.mensaje,
        },
      });
    default:
      return db.electronicInvoice.update({ where: { id }, data: { status: r.estado, message: r.mensaje.slice(0, 900) } });
  }
}

/**
 * Manda (o consulta) una factura ya apartada, con los datos guardados en la
 * fila. Lo usan la emision y los reintentos, que no tienen sesion.
 */
async function procesar(id: string): Promise<ElectronicInvoice> {
  const fila = await db.electronicInvoice.findUniqueOrThrow({
    where: { id },
    include: { sale: { include: { items: true } }, user: { select: { currency: true, billingConfig: true } } },
  });
  const config = fila.user.billingConfig;
  const pais: Pais = esPais(fila.country) ? fila.country : "CO";
  const ambiente: Ambiente = fila.environment === "produccion" ? "produccion" : "pruebas";
  const creds = descifrar(config?.credentials);
  if (!config || !credencialesCompletas(pais, creds)) {
    return aplicar(id, { estado: "RECHAZADA", mensaje: "Faltan las credenciales de " + datosPais(pais).proveedor + " en Ajustes." });
  }

  const venta = fila.sale;
  const moneda = datosPais(pais).moneda;
  const suma = venta.items.reduce((t, i) => t + i.unitPrice * i.qty, 0);
  const lineasVenta: LineaVenta[] =
    venta.items.length === 0 || suma <= 0
      ? [{ name: "Venta", qty: 1, unitPrice: venta.total }]
      : venta.items.map((i) => ({ name: i.name + (i.variantLabel && !i.name.includes(i.variantLabel) ? " (" + i.variantLabel + ")" : ""), qty: i.qty, unitPrice: (i.unitPrice * venta.total) / suma }));
  const { lineas, totales } = lineasFiscales(lineasVenta, moneda, config.taxRate, 2);
  const comprador = fila.customer as unknown as Comprador;

  try {
    if (pais === "CO" && credencialesFactusCompletas(creds)) {
      return aplicar(
        id,
        await emitirFactus(creds, ambiente, {
          // Siempre la misma por venta: si una subida anterior llego, Factus la reconoce.
          referencia: "TEN-" + venta.id,
          rangoId: config.numberingRangeId,
          comprador,
          lineas,
          totales,
          codigoImpuesto: config.taxCode,
          tarifa: config.taxRate,
          metodoPago: venta.paymentMethod,
          observacion: venta.notes,
        })
      );
    }
    if (credencialesDatilCompletas(creds)) {
      // Ya estaba en Datil: se consulta en vez de mandarla otra vez.
      if (fila.providerId && fila.status === "ENVIANDO") {
        return aplicar(id, await consultarDatil(creds, fila.providerId, fila.number));
      }
      let secuencial = fila.sequential;
      if (!secuencial) {
        // El numero se aparta una sola vez por factura: un reintento usa el mismo.
        const siguiente = await db.billingConfig.update({
          where: { id: config.id },
          data: { nextSequential: { increment: 1 } },
          select: { nextSequential: true },
        });
        secuencial = siguiente.nextSequential - 1;
        await db.electronicInvoice.update({
          where: { id },
          data: { sequential: secuencial, number: numeroSri(config.establishment, config.emissionPoint, secuencial) },
        });
      }
      return aplicar(
        id,
        await emitirDatil(creds, ambiente, {
          secuencial,
          fecha: new Date(),
          emisor: {
            ruc: config.taxId ?? "",
            razonSocial: config.legalName ?? "",
            nombreComercial: config.tradeName ?? "",
            direccion: config.fiscalAddress ?? "",
            obligadoContabilidad: config.keepsAccounting,
            contribuyenteEspecial: config.specialTaxpayer,
            establecimiento: config.establishment,
            puntoEmision: config.emissionPoint,
          },
          comprador,
          lineas,
          totales,
          tarifa: config.taxRate,
          metodoPago: venta.paymentMethod,
        })
      );
    }
    return aplicar(id, { estado: "RECHAZADA", mensaje: "Faltan credenciales." });
  } catch (e) {
    return aplicar(id, { estado: "ERROR", mensaje: e instanceof Error ? e.message : "Falló el envío." });
  }
}

/** Consulta una factura que sigue esperando. La usa el boton "Actualizar". */
export async function actualizarFactura(s: Sesion, id: string): Promise<Resultado<FacturaVista>> {
  const f = await db.electronicInvoice.findFirst({ where: { id, userId: s.user.id } });
  if (!f) return falla("No encontramos esa factura.", 404);
  if (f.status === "AUTORIZADA") return { ok: true, datos: facturaVista(f) };
  if (f.status === "ENVIANDO" && Date.now() - f.updatedAt.getTime() < 5_000) return { ok: true, datos: facturaVista(f) };
  if (f.status === "RECHAZADA") return { ok: true, datos: facturaVista(f) };
  return { ok: true, datos: facturaVista(await procesar(f.id)) };
}

/**
 * Lo que corre solo: consulta las que esperan autorizacion y reintenta las que
 * fallaron por no poder hablar con el proveedor. Las rechazadas no: esas
 * necesitan que alguien corrija algo.
 */
export async function reintentarFacturas(limite = 25): Promise<{ revisadas: number; autorizadas: number }> {
  const hace = (ms: number) => new Date(Date.now() - ms);
  const pendientes = await db.electronicInvoice.findMany({
    where: {
      OR: [
        { status: "ENVIANDO", updatedAt: { lt: hace(20_000) } },
        { status: "ERROR", attempts: { lt: 8 }, updatedAt: { lt: hace(5 * 60_000) } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: limite,
    select: { id: true, status: true, updatedAt: true },
  });
  let autorizadas = 0;
  for (const p of pendientes) {
    // Se aparta antes de tocarla, por si dos reintentos corren a la vez.
    const tomada = await db.electronicInvoice.updateMany({
      where: { id: p.id, status: p.status, updatedAt: p.updatedAt },
      data: p.status === "ERROR" ? { status: "ENVIANDO", attempts: { increment: 1 } } : { attempts: { increment: 0 } },
    });
    if (tomada.count === 0) continue;
    const r = await procesar(p.id);
    if (r.status === "AUTORIZADA") autorizadas += 1;
  }
  return { revisadas: pendientes.length, autorizadas };
}

/** El PDF oficial de Colombia, para quien lo quiera ademas del de la app. */
export { pdfFactus } from "./factus";
