import type { Prisma, PrismaClient } from "@prisma/client";
import { calcularCuadre, categoriaDePago, claveDe, type Cuadre } from "./reparto";
import type { LibroReparto, MovimientoExcel, PlanillaExcel } from "./reparto-excel";

/**
 * Importa el Excel de reparto (ya leido, ver lib/reparto-excel.ts) a las
 * tablas de Reparto de una cuenta.
 *
 *   - Sin `aplicar` es un ensayo: no escribe nada y dice lo que haria.
 *   - Se puede correr dos veces: una planilla ya importada (mismo vendedor,
 *     fecha y origen) se salta, y lo demas se busca antes de crearlo.
 *   - Todo va en una sola transaccion. Al final cada planilla se vuelve a
 *     calcular desde la base con calcularCuadre(); si alguna no da lo mismo
 *     que el Excel al centavo, se deshace todo y se dice cual.
 *   - Los clientes nunca se juntan solos: los nombres parecidos se listan para
 *     que la administradora decida.
 *
 * Lo usan la pantalla Reparto > Importar y scripts/importar-reparto.ts.
 */

export type ProductoCatalogo = {
  code: string;
  name: string;
  price: number;
  active: boolean;
  precios: { price: number; desde: string }[];
};

export type ReporteImportacion = {
  aplicado: boolean;
  planillas: {
    ref: string;
    hoja: string;
    fecha: string;
    clave: string;
    vendedor: string | null;
    accion: "crear" | "ya-estaba" | "choca" | "sin-vendedor";
    ventas: number;
    diferencia: number;
    cuadra: boolean;
  }[];
  /** Por hoja: lo mismo que el consolidado del mes. */
  totales: { hoja: string; dias: number; ventas: number; credito: number; contado: number; cartera: number; pagos: number; entregado: number; neto: number }[];
  productosNuevos: string[];
  clientesNuevos: string[];
  posiblesDuplicados: [string, string][];
  saldosIniciales: number;
  cobrosSinDocumento: number;
  /** Clientes cuya cartera calculada no da lo que decia la ultima lista copiada a mano. */
  carteraDistinta: { cliente: string; calculado: number; excel: number }[];
  avisos: string[];
  errores: string[];
};

type Db = PrismaClient | Prisma.TransactionClient;

const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

/**
 * Con que nombre se busca al vendedor de una planilla: la hoja, salvo que la
 * hoja sea un dia de la semana (la de "SÁBADO" es de LUIS): ahi, lo que dice
 * la celda VENDEDOR.
 */
export function claveVendedor(p: Pick<PlanillaExcel, "hoja" | "etiqueta">): string {
  return DIAS.includes(claveDe(p.hoja)) ? p.etiqueta.trim().toUpperCase() : p.hoja.trim().toUpperCase();
}

/** "jimmy" y "jimy" son el mismo: sin letras repetidas. */
const sinDobles = (s: string) => s.replace(/(.)\1+/g, "$1");

/** La persona del equipo cuyo nombre de pila es la clave del vendedor, si hay una sola. */
export function sugerirVendedor(clave: string, equipo: { id: string; name: string }[]): string | null {
  const buscada = sinDobles(claveDe(clave).split(" ")[0] ?? "");
  if (!buscada) return null;
  const candidatos = equipo.filter((s) => sinDobles(claveDe(s.name).split(" ")[0] ?? "") === buscada);
  return candidatos.length === 1 ? candidatos[0].id : null;
}

/** Nombres que parecen el mismo cliente: uno contiene al otro, o cambian en una o dos letras. */
export function posiblesDuplicados(nombres: string[]): [string, string][] {
  const unicos = [...new Map(nombres.map((n) => [claveDe(n), n])).entries()];
  const pares: [string, string][] = [];
  const distancia = (a: string, b: string) => {
    if (Math.abs(a.length - b.length) > 2) return 99;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const sinVive = (k: string) => k.replace(/^(viveres|vivere3s|tienda|barberia|panaderia)\s+/, "");
  for (let i = 0; i < unicos.length; i++) {
    for (let j = i + 1; j < unicos.length; j++) {
      const [ka, a] = unicos[i];
      const [kb, b] = unicos[j];
      const xa = sinVive(ka);
      const xb = sinVive(kb);
      const parecido =
        (xa.length >= 6 && xb.length >= 6 && (xa.includes(xb) || xb.includes(xa))) ||
        (Math.min(xa.length, xb.length) >= 6 && distancia(xa, xb) <= 2);
      if (parecido) pares.push([a, b]);
    }
  }
  return pares;
}

const docClave = (d: string | null | undefined) => {
  const k = claveDe(d ?? "");
  return k === "sn" || k === "s n" ? "" : k;
};

type CreditoAbierto = { id: string; clienteKey: string; documento: string; saldo: number };

/**
 * A que credito se le aplica un cobro: al de su mismo documento y cliente; si
 * el cobro no trae numero (SN) y el cliente debe un solo documento, a ese.
 */
function creditoParaCobro(abiertos: CreditoAbierto[], clienteKey: string, documento: string | null): CreditoAbierto | null {
  const doc = docClave(documento);
  const delCliente = abiertos.filter((c) => c.clienteKey === clienteKey && c.saldo > 0);
  if (doc) return delCliente.find((c) => c.documento === doc) ?? null;
  return delCliente.length === 1 ? delCliente[0] : null;
}

/**
 * El saldo con que arranca la cartera de una hoja: la lista "CUENTAS POR
 * COBRAR" de su primer dia, que ya trae los movimientos de ese dia. Se le
 * quitan los creditos de ese dia (los crea la planilla) y se le devuelven los
 * cobros (los aplica la planilla).
 */
export function saldoInicialDeHoja(primera: PlanillaExcel): MovimientoExcel[] {
  const docs = primera.cartera.map((d) => ({ ...d }));
  const mismo = (a: MovimientoExcel, b: MovimientoExcel) =>
    claveDe(a.cliente ?? "") === claveDe(b.cliente ?? "") && docClave(a.documento) === docClave(b.documento);
  for (const c of primera.creditos) {
    const i = docs.findIndex((d) => mismo(d, c));
    if (i >= 0) docs.splice(i, 1);
  }
  for (const c of primera.cobros) {
    if (c.tipo === "AJUSTE" || !c.cliente) continue;
    const d = docs.find((x) => mismo(x, c)) ?? docs.find((x) => claveDe(x.cliente ?? "") === claveDe(c.cliente ?? ""));
    if (d) d.valor += c.valor;
    else docs.push({ fecha: c.fecha, documento: c.documento, cliente: c.cliente, valor: c.valor, factura: null });
  }
  return docs.filter((d) => d.cliente && d.valor > 0);
}

const MARCA_INICIAL = "Saldo inicial del Excel";
const MARCA_ATRASADA = "CUENTAS ATRASADAS del Excel";

export async function importarReparto(
  db: PrismaClient,
  args: {
    userId: string;
    libro: LibroReparto;
    catalogo: ProductoCatalogo[];
    /** Clave del vendedor (ver claveVendedor) -> id de la persona del equipo. */
    vendedores: Record<string, string>;
    aplicar: boolean;
    /** Quien importa, para la planilla. */
    staffId?: string | null;
  }
): Promise<ReporteImportacion> {
  const { userId, libro, catalogo, vendedores, aplicar } = args;
  const reporte: ReporteImportacion = {
    aplicado: false,
    planillas: [],
    totales: [],
    productosNuevos: [],
    clientesNuevos: [],
    posiblesDuplicados: [],
    saldosIniciales: 0,
    cobrosSinDocumento: 0,
    carteraDistinta: [],
    avisos: [...libro.avisos],
    errores: [],
  };

  const equipo = await db.staff.findMany({ where: { userId }, select: { id: true, name: true } });
  const nombreDe = new Map(equipo.map((s) => [s.id, s.name]));
  const planillas = [...libro.planillas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hoja.localeCompare(b.hoja));

  // ---- lo que ya hay en la cuenta
  const [productosHay, clientesHay, planillasHay] = await Promise.all([
    db.repartoProducto.findMany({ where: { userId }, select: { id: true, nameKey: true, code: true } }),
    db.repartoCliente.findMany({ where: { userId }, select: { id: true, name: true, nameKey: true } }),
    db.repartoPlanilla.findMany({ where: { userId }, select: { staffId: true, day: true, origen: true, origenRef: true } }),
  ]);

  // ---- planillas: que se crea y que se salta
  const aCrear: (PlanillaExcel & { staffId: string; cuadre: Cuadre })[] = [];
  for (const p of planillas) {
    const clave = claveVendedor(p);
    const staffId = vendedores[clave] && nombreDe.has(vendedores[clave]) ? vendedores[clave] : null;
    const cuadre = calcularCuadre({
      lineas: p.lineas,
      otrosDescuentos: p.otrosDescuentos,
      creditos: p.creditos,
      cobros: p.cobros,
      pagos: p.pagos,
      entregado: p.entregado,
    });
    const cuadra = cuadre.ventasDiaria === p.esperado.ventas && cuadre.diferencia === p.esperado.diferencia &&
      cuadre.credito === p.esperado.credito && cuadre.cartera === p.esperado.cartera && cuadre.pagos === p.esperado.pagos;
    const existente = staffId ? planillasHay.find((x) => x.staffId === staffId && x.day === p.fecha) : undefined;
    const accion: ReporteImportacion["planillas"][number]["accion"] = !staffId
      ? "sin-vendedor"
      : existente
        ? existente.origen === "EXCEL" && existente.origenRef === p.ref
          ? "ya-estaba"
          : "choca"
        : "crear";
    reporte.planillas.push({
      ref: p.ref,
      hoja: p.hoja,
      fecha: p.fecha,
      clave,
      vendedor: staffId ? nombreDe.get(staffId) ?? null : null,
      accion,
      ventas: cuadre.ventasDiaria,
      diferencia: cuadre.diferencia,
      cuadra,
    });
    if (!cuadra) reporte.errores.push(p.ref + ": no da lo mismo que el Excel.");
    if (accion === "sin-vendedor") reporte.errores.push("Falta decir quién es " + clave + " en el equipo.");
    if (accion === "choca") reporte.avisos.push(p.ref + ": " + nombreDe.get(staffId!) + " ya tiene una planilla el " + p.fecha + " que no vino de este Excel; no se toca.");
    if (accion === "crear" && staffId) aCrear.push({ ...p, staffId, cuadre });
  }
  reporte.errores = [...new Set(reporte.errores)];

  // ---- totales por hoja, como el consolidado
  const porHoja = new Map<string, ReporteImportacion["totales"][number]>();
  for (const p of planillas) {
    const r = reporte.planillas.find((x) => x.ref === p.ref)!;
    const c = calcularCuadre({ lineas: p.lineas, otrosDescuentos: p.otrosDescuentos, creditos: p.creditos, cobros: p.cobros, pagos: p.pagos, entregado: p.entregado });
    const t = porHoja.get(p.hoja) ?? { hoja: p.hoja, dias: 0, ventas: 0, credito: 0, contado: 0, cartera: 0, pagos: 0, entregado: 0, neto: 0 };
    t.dias++;
    t.ventas += c.ventasDiaria;
    t.credito += c.credito;
    t.contado += c.contado;
    t.cartera += c.cartera;
    t.pagos += c.pagos;
    t.entregado += c.entregado;
    t.neto += r.diferencia;
    porHoja.set(p.hoja, t);
  }
  reporte.totales = [...porHoja.values()];

  // ---- productos
  const productoKey = new Map(productosHay.map((x) => [x.nameKey, x.id]));
  const catalogoPorKey = new Map(catalogo.map((c) => [claveDe(c.name), c]));
  const nombresLinea = new Map<string, string>();
  for (const p of planillas) for (const l of p.lineas) nombresLinea.set(claveDe(l.producto), l.producto.trim());
  for (const c of catalogo) if (!productoKey.has(claveDe(c.name))) reporte.productosNuevos.push(c.code + " " + c.name);
  for (const [k, nombre] of nombresLinea) {
    if (!productoKey.has(k) && !catalogoPorKey.has(k)) reporte.productosNuevos.push(nombre + " (no está en el catálogo)");
  }

  // ---- clientes
  const clienteKey = new Map(clientesHay.map((x) => [x.nameKey, x.id]));
  const nombresCliente = new Map<string, { name: string; staffId: string | null }>();
  const anotarCliente = (nombre: string | null, staffId: string | null) => {
    const k = claveDe(nombre ?? "");
    if (!k || nombresCliente.has(k)) return;
    nombresCliente.set(k, { name: nombre!.replace(/\s+/g, " ").trim(), staffId });
  };
  const primeraDeHoja = new Map<string, PlanillaExcel>();
  for (const p of planillas) if (!primeraDeHoja.has(p.hoja)) primeraDeHoja.set(p.hoja, p);
  const iniciales = [...primeraDeHoja.values()].flatMap((p) => {
    const staffId = vendedores[claveVendedor(p)] ?? null;
    return saldoInicialDeHoja(p).map((d) => ({ ...d, staffId, hoja: p.hoja, alDia: p.fecha }));
  });
  for (const d of iniciales) anotarCliente(d.cliente, d.staffId);
  for (const p of aCrear) {
    for (const c of p.creditos) anotarCliente(c.cliente, p.staffId);
    for (const c of p.cobros) if (c.tipo === "COBRO") anotarCliente(c.cliente, p.staffId);
  }
  for (const a of libro.atrasadas) anotarCliente(a.cliente, null);
  for (const [k, c] of nombresCliente) if (!clienteKey.has(k)) reporte.clientesNuevos.push(c.name);
  reporte.posiblesDuplicados = posiblesDuplicados([...clientesHay.map((c) => c.name), ...reporte.clientesNuevos]);
  reporte.saldosIniciales = iniciales.length + libro.atrasadas.length;

  if (!aplicar || reporte.errores.length > 0) {
    // Lo que daria la cartera, con los mismos pasos pero sin escribir.
    reporte.cobrosSinDocumento = simularCobrosSinDocumento(iniciales, aCrear);
    reporte.carteraDistinta = compararCartera(iniciales, libro, planillas);
    return reporte;
  }

  // ---- a escribir, todo o nada
  await db.$transaction(
    async (tx) => {
      // Productos del catalogo y los que solo aparecen en las planillas.
      let siguiente = Math.max(0, ...productosHay.map((x) => Number(x.code.replace(/\D/g, "")) || 0), ...catalogo.map((c) => Number(c.code.replace(/\D/g, "")) || 0)) + 1;
      for (const c of catalogo) {
        const k = claveDe(c.name);
        if (productoKey.has(k)) continue;
        const nuevo = await tx.repartoProducto.create({
          data: { userId, code: c.code, name: c.name, nameKey: k, price: c.price, active: c.active, position: Number(c.code.replace(/\D/g, "")) || 0 },
        });
        productoKey.set(k, nuevo.id);
      }
      for (const [k, nombre] of nombresLinea) {
        if (productoKey.has(k)) continue;
        const precio = planillas.flatMap((p) => p.lineas).find((l) => claveDe(l.producto) === k)?.precio ?? 0;
        const code = "P" + String(siguiente++).padStart(3, "0");
        const nuevo = await tx.repartoProducto.create({ data: { userId, code, name: nombre, nameKey: k, price: precio, position: siguiente } });
        productoKey.set(k, nuevo.id);
      }
      // Historial de precios: el del catalogo y el primer dia de cada precio en las planillas.
      const precios = new Map<string, { productoId: string; price: number; desde: string }>();
      for (const c of catalogo) for (const h of c.precios) {
        const productoId = productoKey.get(claveDe(c.name))!;
        precios.set(productoId + "|" + h.desde, { productoId, price: h.price, desde: h.desde });
      }
      for (const p of planillas) for (const l of p.lineas) {
        const productoId = productoKey.get(claveDe(l.producto))!;
        const ya = [...precios.values()].some((x) => x.productoId === productoId && x.price === l.precio && x.desde <= p.fecha);
        if (!ya && l.precio) precios.set(productoId + "|" + p.fecha, { productoId, price: l.precio, desde: p.fecha });
      }
      await tx.repartoPrecio.createMany({ data: [...precios.values()].map((x) => ({ userId, ...x })), skipDuplicates: true });

      // Clientes.
      for (const [k, c] of nombresCliente) {
        if (clienteKey.has(k)) continue;
        const nuevo = await tx.repartoCliente.create({ data: { userId, name: c.name, nameKey: k, staffId: c.staffId } });
        clienteKey.set(k, nuevo.id);
      }

      // Saldos iniciales: la lista del primer dia de cada hoja y las cuentas atrasadas.
      const abiertos: CreditoAbierto[] = [];
      const hayCredito = async (clienteId: string, day: string, documento: string | null, valor: number) =>
        tx.repartoCredito.findFirst({ where: { userId, clienteId, day, documento, valor, planillaId: null }, select: { id: true } });
      for (const d of iniciales) {
        const clienteId = clienteKey.get(claveDe(d.cliente!))!;
        const day = d.fecha ?? d.alDia;
        const ya = await hayCredito(clienteId, day, d.documento, d.valor);
        const credito = ya ?? (await tx.repartoCredito.create({
          data: { userId, clienteId, day, documento: d.documento, valor: d.valor, notes: MARCA_INICIAL + " (hoja " + d.hoja + ", al " + d.alDia + ")" },
          select: { id: true },
        }));
        abiertos.push({ id: credito.id, clienteKey: claveDe(d.cliente!), documento: docClave(d.documento), saldo: d.valor });
      }
      for (const a of libro.atrasadas) {
        const clienteId = clienteKey.get(claveDe(a.cliente))!;
        const day = a.fecha ?? "2026-01-01";
        const ya = await hayCredito(clienteId, day, a.documento, a.saldo);
        const credito = ya ?? (await tx.repartoCredito.create({
          data: { userId, clienteId, day, documento: a.documento, valor: a.saldo, notes: MARCA_ATRASADA + (a.historial ? ". Historial: " + a.historial : "") },
          select: { id: true },
        }));
        abiertos.push({ id: credito.id, clienteKey: claveDe(a.cliente), documento: docClave(a.documento), saldo: a.saldo });
      }

      // Las planillas, en orden de fecha: cada cobro se aplica a lo que ya se debia ese dia.
      const personas = equipo.map((s) => s.name);
      for (const p of aCrear) {
        const planilla = await tx.repartoPlanilla.create({
          data: {
            userId,
            staffId: p.staffId,
            day: p.fecha,
            acompanante: p.acompanante,
            otrosDescuentos: p.otrosDescuentos,
            entregado: p.entregado,
            entregadoDetalle: p.entregadoDetalle,
            estado: "CERRADA",
            closedAt: new Date(),
            closedById: args.staffId ?? null,
            createdById: args.staffId ?? null,
            origen: "EXCEL",
            origenRef: p.ref,
            notes:
              (p.etiqueta && claveDe(p.etiqueta) !== claveDe(claveVendedor(p)) ? "En el Excel el bloque decía \"" + p.etiqueta + "\". " : "") +
              (p.ref.split("#")[1] !== p.fecha ? "La cabecera del Excel decía " + p.ref.split("#")[1] + "." : "") || null,
          },
        });
        // Un mismo producto dos veces en el bloque se suma en una sola linea.
        const lineas = new Map<string, Prisma.RepartoLineaCreateManyInput>();
        for (const l of p.lineas) {
          const productoId = productoKey.get(claveDe(l.producto))!;
          const ya = lineas.get(productoId);
          if (ya) {
            reporte.avisos.push(p.ref + ": " + l.producto + " aparece dos veces; se juntó.");
            ya.carga = (ya.carga ?? 0) + l.carga;
            ya.devolucion = (ya.devolucion ?? 0) + l.devolucion;
            ya.caducadoCant = (ya.caducadoCant ?? 0) + l.caducadoCant;
            continue;
          }
          lineas.set(productoId, {
            userId,
            planillaId: planilla.id,
            productoId,
            carga: l.carga,
            cargaDetalle: l.cargaDetalle,
            devolucion: l.devolucion,
            precio: l.precio,
            base12: l.base12,
            iva: l.iva,
            unidVendCant: l.unidVendCant,
            unidVendValor: l.unidVendValor,
            docDescuento: l.docDescuento,
            dctoPrecio: l.dctoPrecio,
            dctoPromocion: l.dctoPromocion,
            caducadoCant: l.caducadoCant,
            devolUnidadesValor: l.devolUnidadesValor,
          });
        }
        await tx.repartoLinea.createMany({ data: [...lineas.values()] });

        for (const [i, c] of p.creditos.entries()) {
          const clienteId = clienteKey.get(claveDe(c.cliente ?? ""));
          if (!clienteId) {
            throw new Error(p.ref + ": un crédito de " + c.valor / 100 + " no dice de qué cliente es.");
          }
          const credito = await tx.repartoCredito.create({
            data: { userId, planillaId: planilla.id, clienteId, day: c.fecha ?? p.fecha, documento: c.documento, factura: c.factura, valor: c.valor, position: i },
            select: { id: true },
          });
          abiertos.push({ id: credito.id, clienteKey: claveDe(c.cliente ?? ""), documento: docClave(c.documento), saldo: c.valor });
        }
        for (const [i, c] of p.cobros.entries()) {
          const k = claveDe(c.cliente ?? "");
          const ajuste = c.tipo === "AJUSTE";
          const aplicado = ajuste ? null : creditoParaCobro(abiertos, k, c.documento);
          if (aplicado) aplicado.saldo -= c.valor;
          const revisar = !ajuste && !aplicado;
          if (revisar) reporte.cobrosSinDocumento++;
          await tx.repartoCobro.create({
            data: {
              userId,
              planillaId: planilla.id,
              clienteId: ajuste ? null : clienteKey.get(k) ?? null,
              creditoId: aplicado?.id ?? null,
              fechaDocumento: c.fecha,
              documento: c.documento,
              factura: c.factura,
              valor: c.valor,
              tipo: c.tipo,
              revisar,
              position: i,
            },
          });
        }
        await tx.repartoPago.createMany({
          data: p.pagos.map((x, i) => ({
            userId,
            planillaId: planilla.id,
            documento: x.documento,
            concepto: x.concepto,
            categoria: categoriaDePago(x.concepto, personas),
            valor: x.valor,
            position: i,
          })),
        });
      }

      // La prueba de verdad: lo guardado, leido de vuelta, da lo mismo que el Excel.
      const guardadas = await tx.repartoPlanilla.findMany({
        where: { userId, origen: "EXCEL", origenRef: { in: aCrear.map((p) => p.ref) } },
        include: { lineas: true, creditos: true, cobros: true, pagos: true },
      });
      for (const g of guardadas) {
        const p = aCrear.find((x) => x.ref === g.origenRef && x.staffId === g.staffId);
        if (!p) continue;
        const c = calcularCuadre(g);
        const mal = (["ventasDiaria", "credito", "cartera", "pagos", "diferencia"] as const).filter(
          (k) => Math.abs(c[k] - p.cuadre[k]) > 1
        );
        if (mal.length || c.ventasDiaria !== p.esperado.ventas || c.diferencia !== p.esperado.diferencia) {
          throw new Error(p.ref + " no cuadra después de guardarla (" + mal.join(", ") + "). No se importó nada.");
        }
      }
    },
    { timeout: 120_000, maxWait: 20_000 }
  );

  reporte.aplicado = true;
  reporte.carteraDistinta = compararCartera(iniciales, libro, planillas);
  return reporte;
}

/** Cuantos cobros quedarian sin documento al que aplicarse, sin escribir nada. */
function simularCobrosSinDocumento(
  iniciales: (MovimientoExcel & { hoja: string })[],
  aCrear: PlanillaExcel[]
): number {
  const abiertos: CreditoAbierto[] = iniciales.map((d, i) => ({
    id: "i" + i,
    clienteKey: claveDe(d.cliente ?? ""),
    documento: docClave(d.documento),
    saldo: d.valor,
  }));
  let sin = 0;
  for (const p of aCrear) {
    p.creditos.forEach((c, i) =>
      abiertos.push({ id: p.ref + i, clienteKey: claveDe(c.cliente ?? ""), documento: docClave(c.documento), saldo: c.valor })
    );
    for (const c of p.cobros) {
      if (c.tipo === "AJUSTE") continue;
      const a = creditoParaCobro(abiertos, claveDe(c.cliente ?? ""), c.documento);
      if (a) a.saldo -= c.valor;
      else sin++;
    }
  }
  return sin;
}

/**
 * La cartera que sale de sumar creditos y restar cobros, contra la ultima
 * lista "CUENTAS POR COBRAR" de cada hoja (copiada a mano en el Excel). Las
 * diferencias se informan, no detienen nada: el acumulado del Excel tenia saltos.
 */
function compararCartera(
  iniciales: MovimientoExcel[],
  libro: LibroReparto,
  planillas: PlanillaExcel[]
): ReporteImportacion["carteraDistinta"] {
  const calc = new Map<string, { nombre: string; valor: number }>();
  const sumar = (nombre: string | null, valor: number) => {
    const k = claveDe(nombre ?? "");
    if (!k) return;
    const x = calc.get(k) ?? { nombre: nombre!.trim(), valor: 0 };
    x.valor += valor;
    calc.set(k, x);
  };
  for (const d of iniciales) sumar(d.cliente, d.valor);
  for (const p of planillas) {
    for (const c of p.creditos) sumar(c.cliente, c.valor);
    for (const c of p.cobros) if (c.tipo === "COBRO") sumar(c.cliente, -c.valor);
  }
  const excel = new Map<string, number>();
  const ultimas = new Map<string, PlanillaExcel>();
  for (const p of planillas) ultimas.set(p.hoja, p);
  const vistos = new Set<string>();
  for (const p of ultimas.values()) {
    for (const d of p.cartera) {
      const k = claveDe(d.cliente ?? "");
      const id = k + "|" + docClave(d.documento) + "|" + d.valor;
      if (!k || vistos.has(id)) continue;
      vistos.add(id);
      excel.set(k, (excel.get(k) ?? 0) + d.valor);
    }
  }
  void libro;
  const salida: ReporteImportacion["carteraDistinta"] = [];
  for (const k of new Set([...calc.keys(), ...excel.keys()])) {
    const a = calc.get(k)?.valor ?? 0;
    const b = excel.get(k) ?? 0;
    if (Math.abs(a - b) > 1) salida.push({ cliente: calc.get(k)?.nombre ?? k, calculado: a, excel: b });
  }
  return salida.sort((a, b) => Math.abs(b.calculado - b.excel) - Math.abs(a.calculado - a.excel));
}
