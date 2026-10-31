import { db } from "./db";
import { antiguedad, calcularCuadre, totalLineaDe, vendidaDe, caducadoValorDe, type Cuadre } from "./reparto";

/**
 * Las consultas de Reparto que usan varias pantallas (ver lib/reparto.ts).
 * Todo filtra por el negocio: nunca solo por el id del registro.
 */

/** El precio de un producto un dia dado: el ultimo que empezo a valer antes o ese dia. */
export function precioDelDia(
  producto: { price: number; precios: { price: number; desde: string }[] },
  day: string
): number {
  const vigente = [...producto.precios].filter((p) => p.desde <= day).sort((a, b) => b.desde.localeCompare(a.desde))[0];
  return vigente?.price ?? producto.price;
}

export async function cargarPlanilla(userId: string, id: string) {
  return db.repartoPlanilla.findFirst({
    where: { id, userId },
    include: {
      staff: { select: { id: true, name: true } },
      lineas: { include: { producto: { select: { id: true, code: true, name: true } } } },
      creditos: { orderBy: { position: "asc" }, include: { cliente: { select: { id: true, name: true } }, cobros: { select: { id: true } } } },
      cobros: { orderBy: { position: "asc" }, include: { cliente: { select: { id: true, name: true } } } },
      pagos: { orderBy: { position: "asc" } },
    },
  });
}

export type DocumentoCartera = {
  id: string;
  day: string;
  documento: string | null;
  factura: string | null;
  valor: number;
  cobrado: number;
  saldo: number;
  dias: number;
  notes: string | null;
  /** De que planilla salio; nulo en los saldos iniciales. */
  planillaId: string | null;
};

export type ClienteCartera = {
  id: string;
  name: string;
  staffId: string | null;
  /** Lo que debe: creditos menos todos sus cobros. */
  saldo: number;
  documentos: DocumentoCartera[];
  /** Cobros que no se pudieron aplicar a un documento: bajan el saldo del cliente igual. */
  abonosSinDocumento: number;
  ultimoMovimiento: string | null;
};

/**
 * La cartera de la ruta, calculada: cada credito es un documento por cobrar y
 * cada cobro se resta del suyo. Lo de una planilla anulada no cuenta. Ya no se
 * copia a mano de un dia a otro como en el Excel.
 */
export async function carteraDe(userId: string, hoy: string): Promise<ClienteCartera[]> {
  const vale = { OR: [{ planillaId: null }, { planilla: { estado: { not: "ANULADA" as const } } }] };
  const [clientes, creditos, cobros] = await Promise.all([
    db.repartoCliente.findMany({ where: { userId }, select: { id: true, name: true, staffId: true } }),
    db.repartoCredito.findMany({
      where: { userId, ...vale },
      select: { id: true, clienteId: true, day: true, documento: true, factura: true, valor: true, notes: true, planillaId: true },
      orderBy: { day: "asc" },
    }),
    db.repartoCobro.findMany({
      where: { userId, tipo: "COBRO", planilla: { estado: { not: "ANULADA" } } },
      select: { clienteId: true, creditoId: true, valor: true, planilla: { select: { day: true } } },
    }),
  ]);

  const cobradoPorCredito = new Map<string, number>();
  const sueltos = new Map<string, number>();
  const ultimo = new Map<string, string>();
  for (const c of cobros) {
    if (c.creditoId) cobradoPorCredito.set(c.creditoId, (cobradoPorCredito.get(c.creditoId) ?? 0) + c.valor);
    else if (c.clienteId) sueltos.set(c.clienteId, (sueltos.get(c.clienteId) ?? 0) + c.valor);
    if (c.clienteId && (ultimo.get(c.clienteId) ?? "") < c.planilla.day) ultimo.set(c.clienteId, c.planilla.day);
  }

  const porCliente = new Map<string, DocumentoCartera[]>();
  for (const cr of creditos) {
    const cobrado = cobradoPorCredito.get(cr.id) ?? 0;
    const lista = porCliente.get(cr.clienteId) ?? [];
    lista.push({
      id: cr.id,
      day: cr.day,
      documento: cr.documento,
      factura: cr.factura,
      valor: cr.valor,
      cobrado,
      saldo: cr.valor - cobrado,
      dias: antiguedad(cr.day, hoy),
      notes: cr.notes,
      planillaId: cr.planillaId,
    });
    porCliente.set(cr.clienteId, lista);
    if ((ultimo.get(cr.clienteId) ?? "") < cr.day) ultimo.set(cr.clienteId, cr.day);
  }

  return clientes
    .map((c) => {
      const documentos = porCliente.get(c.id) ?? [];
      const abonosSinDocumento = sueltos.get(c.id) ?? 0;
      return {
        ...c,
        documentos,
        abonosSinDocumento,
        saldo: documentos.reduce((s, d) => s + d.saldo, 0) - abonosSinDocumento,
        ultimoMovimiento: ultimo.get(c.id) ?? null,
      };
    })
    .sort((a, b) => b.saldo - a.saldo);
}

export type FilaProducto = {
  productoId: string;
  code: string;
  name: string;
  carga: number;
  devolucion: number;
  vendida: number;
  base0: number;
  caducadoCant: number;
  caducadoValor: number;
  descuentos: number;
  total: number;
};

export type Consolidado = {
  vendedor: { id: string; name: string } | null;
  dias: number;
  productos: FilaProducto[];
  cuadre: Omit<Cuadre, "semaforo">;
};

const cuadreVacio = (): Omit<Cuadre, "semaforo"> => ({
  totalGeneral: 0, ventasDiaria: 0, credito: 0, contado: 0, cartera: 0, recibido: 0, pagos: 0, caja: 0, entregado: 0, diferencia: 0, faltante: 0, sobrante: 0,
});

/**
 * El consolidado del Excel (CONSOLID,MES), calculado: por vendedor y en
 * general, cada producto y cada linea del cuadre. Agrupa por producto y no por
 * nombre: en el Excel "PAPA GRANDE" y "PAPA GRANDE NAT" no se juntaban y
 * salian en cero.
 */
export async function consolidadoDe(userId: string, desde: string, hasta: string, staffId?: string) {
  const planillas = await db.repartoPlanilla.findMany({
    where: { userId, day: { gte: desde, lte: hasta }, estado: { not: "ANULADA" }, ...(staffId ? { staffId } : {}) },
    orderBy: [{ day: "asc" }],
    include: {
      staff: { select: { id: true, name: true } },
      lineas: { include: { producto: { select: { id: true, code: true, name: true, position: true } } } },
      creditos: { select: { valor: true } },
      cobros: { select: { valor: true } },
      pagos: { select: { valor: true, categoria: true, concepto: true } },
    },
  });

  const conCuadre = planillas.map((p) => ({ ...p, cuadre: calcularCuadre(p) }));
  const armar = (lista: typeof conCuadre, vendedor: Consolidado["vendedor"]): Consolidado => {
    const productos = new Map<string, FilaProducto & { position: number }>();
    const cuadre = cuadreVacio();
    for (const p of lista) {
      for (const k of Object.keys(cuadre) as (keyof typeof cuadre)[]) cuadre[k] += p.cuadre[k];
      for (const l of p.lineas) {
        const f = productos.get(l.productoId) ?? {
          productoId: l.productoId, code: l.producto.code, name: l.producto.name, position: l.producto.position,
          carga: 0, devolucion: 0, vendida: 0, base0: 0, caducadoCant: 0, caducadoValor: 0, descuentos: 0, total: 0,
        };
        f.carga += l.carga;
        f.devolucion += l.devolucion;
        f.vendida += vendidaDe(l);
        f.base0 += vendidaDe(l) * l.precio;
        f.caducadoCant += l.caducadoCant;
        f.caducadoValor += caducadoValorDe(l);
        f.descuentos += l.dctoPrecio + l.dctoPromocion + l.devolUnidadesValor;
        f.total += totalLineaDe(l);
        productos.set(l.productoId, f);
      }
    }
    return {
      vendedor,
      dias: lista.length,
      productos: [...productos.values()].sort((a, b) => a.position - b.position || a.code.localeCompare(b.code)),
      cuadre,
    };
  };

  const vendedores = new Map<string, { id: string; name: string }>();
  for (const p of conCuadre) vendedores.set(p.staff.id, p.staff);
  return {
    planillas: conCuadre,
    porVendedor: [...vendedores.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((v) => armar(conCuadre.filter((p) => p.staffId === v.id), v)),
    general: armar(conCuadre, null),
  };
}
