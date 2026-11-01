"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { dayIn, isValidDay, timeIn, todayIn } from "@/lib/dates";
import { str, texto } from "@/lib/format";
import { esAdminDeChopo } from "@/lib/chopo";
import { aCentavos, categoriaDePago, claveDe, creditoDelCobro, esCategoriaPago, esSuma, evaluarSuma } from "@/lib/reparto";
import { porQueNoSeAnula } from "@/lib/reparto-datos";
import { FECHAS_CORREGIDAS, leerExcelReparto } from "@/lib/reparto-excel";
import { claveVendedor, importarReparto, sugerirVendedor, type ProductoCatalogo, type ReporteImportacion } from "@/lib/reparto-importar";
import catalogoExcel from "../../prisma/datos/reparto-catalogo.json";

// Reparto (ver lib/reparto.ts). Cada accion vuelve a mirar quien la pide: solo
// la administradora de Chopo Snacks. Todo se busca por id Y por negocio.

export type RepartoState =
  | {
      error?: string;
      ok?: string;
      avisos?: string[];
      confirmar?: string;
      /** Los ids de los creditos guardados, en el orden en que vinieron: asi el siguiente guardado los corrige y no los repite. */
      creditosIds?: string[];
    }
  | undefined;

const SIN_ACCESO = "Reparto es solo de la administradora del negocio.";
const RUTA = "/panel/reparto";

async function acceso() {
  const sesion = await requireSession();
  return esAdminDeChopo(sesion.user, sesion.staff) ? sesion : null;
}

// ------------------------------------------------------------------ planilla

/** Abre la planilla de un vendedor en un dia; si ya existe, lleva a esa. */
export async function abrirPlanillaAction(_prev: RepartoState, formData: FormData): Promise<RepartoState> {
  const sesion = await acceso();
  if (!sesion) return { error: SIN_ACCESO };
  const { user, staff } = sesion;
  const staffId = str(formData.get("staffId"));
  const day = str(formData.get("day"));
  if (!isValidDay(day)) return { error: "Escoge la fecha." };
  const vendedor = await db.staff.findFirst({ where: { id: staffId, userId: user.id }, select: { id: true } });
  if (!vendedor) return { error: "Escoge el vendedor." };
  const ya = await db.repartoPlanilla.findUnique({ where: { userId_staffId_day: { userId: user.id, staffId, day } }, select: { id: true } });
  const id =
    ya?.id ??
    (await db.repartoPlanilla.create({ data: { userId: user.id, staffId, day, createdById: staff.id }, select: { id: true } })).id;
  revalidatePath(RUTA);
  redirect(RUTA + "/" + id);
}

export type FilaLineaPedida = {
  productoId: string;
  carga: string;
  devolucion: string;
  precio: string;
  caducadoCant?: string;
  unidVendCant?: string;
  unidVendValor?: string;
  dctoPrecio?: string;
  dctoPromocion?: string;
  devolUnidadesValor?: string;
  docDescuento?: string;
};

export type PlanillaPedida = {
  id: string;
  acompanante?: string;
  otrosDescuentos?: string;
  entregado?: string;
  notes?: string;
  lineas: FilaLineaPedida[];
  creditos: { id?: string; cliente: string; day?: string; documento?: string; factura?: string; valor: string }[];
  cobros: { tipo?: string; cliente?: string; creditoId?: string; fechaDocumento?: string; documento?: string; factura?: string; valor: string }[];
  pagos: { documento?: string; concepto: string; categoria?: string; valor: string }[];
  /** Ya se le aviso que un cobro deja un documento en negativo y dijo que si. */
  confirmado?: boolean;
};

class Rechazo extends Error {}

/** Unidades: "105+55" vale, negativo no. */
function unidadesDe(t: string | undefined, que: string): number {
  const n = evaluarSuma(t);
  if (!Number.isFinite(n) || n < 0) throw new Rechazo(que + ": revisa la cantidad (\"" + t + "\").");
  return Math.round(n);
}

/** Plata en centavos: "0,80", "33.15+246". */
function plataDe(t: string | undefined, que: string): number {
  const n = evaluarSuma(t);
  if (!Number.isFinite(n) || n < 0) throw new Rechazo(que + ": revisa el valor (\"" + t + "\").");
  return aCentavos(n);
}

/**
 * Guarda la planilla entera: productos, creditos, cobros, pagos y entrega.
 * Los totales no se guardan: salen de calcularCuadre().
 */
export async function guardarPlanillaAction(pedido: PlanillaPedida): Promise<RepartoState> {
  const sesion = await acceso();
  if (!sesion) return { error: SIN_ACCESO };
  const { user } = sesion;

  const planilla = await db.repartoPlanilla.findFirst({
    where: { id: String(pedido?.id ?? ""), userId: user.id },
    include: { creditos: { include: { cobros: { select: { id: true, planillaId: true } } } } },
  });
  if (!planilla) return { error: "No encontramos esa planilla." };
  if (planilla.estado !== "BORRADOR") return { error: "La planilla está " + planilla.estado.toLowerCase() + ". Reábrela para corregirla." };

  const avisos: string[] = [];
  let creditosIds: string[] = [];
  try {
    // ---- productos
    const productos = await db.repartoProducto.findMany({ where: { userId: user.id }, select: { id: true, name: true } });
    const nombreProducto = new Map(productos.map((p) => [p.id, p.name]));
    const lineas = (Array.isArray(pedido.lineas) ? pedido.lineas : []).flatMap((l) => {
      const nombre = nombreProducto.get(String(l.productoId));
      if (!nombre) return [];
      const fila = {
        productoId: String(l.productoId),
        carga: unidadesDe(l.carga, nombre),
        cargaDetalle: esSuma(l.carga) ? String(l.carga).replace(/\s/g, "") : null,
        devolucion: unidadesDe(l.devolucion, nombre),
        precio: plataDe(l.precio, nombre),
        caducadoCant: unidadesDe(l.caducadoCant, nombre),
        unidVendCant: unidadesDe(l.unidVendCant, nombre),
        unidVendValor: plataDe(l.unidVendValor, nombre),
        dctoPrecio: plataDe(l.dctoPrecio, nombre),
        dctoPromocion: plataDe(l.dctoPromocion, nombre),
        devolUnidadesValor: plataDe(l.devolUnidadesValor, nombre),
        docDescuento: String(l.docDescuento ?? "").trim().slice(0, 40) || null,
      };
      if (fila.devolucion > fila.carga) avisos.push(nombre + ": devolvió más de lo que cargó.");
      const mueve = fila.carga || fila.devolucion || fila.caducadoCant || fila.unidVendValor || fila.dctoPrecio || fila.dctoPromocion || fila.devolUnidadesValor;
      return mueve ? [fila] : [];
    });

    // ---- clientes por nombre (se crean los nuevos, con este vendedor)
    const clientes = await db.repartoCliente.findMany({ where: { userId: user.id }, select: { id: true, nameKey: true } });
    const clienteId = new Map(clientes.map((c) => [c.nameKey, c.id]));
    const nuevosClientes = new Map<string, string>();
    const clienteDe = (nombre: string | undefined, que: string): string => {
      const n = String(nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      const k = claveDe(n);
      if (!k) throw new Rechazo(que + ": falta el cliente.");
      if (!clienteId.has(k) && !nuevosClientes.has(k)) nuevosClientes.set(k, n);
      return k;
    };

    // ---- creditos
    const creditos = (Array.isArray(pedido.creditos) ? pedido.creditos : []).map((c, i) => {
      const que = "Crédito " + (i + 1);
      return {
        id: c.id && planilla.creditos.some((x) => x.id === c.id) ? c.id : null,
        clienteKey: clienteDe(c.cliente, que),
        day: isValidDay(String(c.day ?? "")) ? String(c.day) : planilla.day,
        documento: String(c.documento ?? "").trim().slice(0, 40) || null,
        factura: String(c.factura ?? "").trim().slice(0, 40) || null,
        valor: plataDe(c.valor, que),
      };
    });
    // Un credito que ya tiene cobros en otra planilla no se puede quitar.
    for (const viejo of planilla.creditos) {
      if (!creditos.some((c) => c.id === viejo.id) && viejo.cobros.some((x) => x.planillaId !== planilla.id)) {
        throw new Rechazo("El crédito " + (viejo.documento ?? "") + " ya tiene cobros en otra planilla: no se puede quitar.");
      }
    }

    // ---- cobros
    const cobros = (Array.isArray(pedido.cobros) ? pedido.cobros : []).map((c, i) => {
      const que = "Cobro " + (i + 1);
      const ajuste = c.tipo === "AJUSTE";
      return {
        tipo: ajuste ? "AJUSTE" : "COBRO",
        clienteKey: ajuste && !String(c.cliente ?? "").trim() ? null : clienteDe(c.cliente, que),
        creditoId: c.creditoId ? String(c.creditoId) : null,
        fechaDocumento: isValidDay(String(c.fechaDocumento ?? "")) ? String(c.fechaDocumento) : null,
        documento: String(c.documento ?? "").trim().slice(0, 40) || null,
        factura: String(c.factura ?? "").trim().slice(0, 40) || null,
        valor: plataDe(c.valor, que),
      };
    });

    // ---- pagos
    const equipo = await db.staff.findMany({ where: { userId: user.id }, select: { name: true } });
    const pagos = (Array.isArray(pedido.pagos) ? pedido.pagos : []).flatMap((p, i) => {
      const concepto = String(p.concepto ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      const valor = plataDe(p.valor, "Gasto " + (i + 1));
      if (!concepto && !valor) return [];
      if (!concepto) throw new Rechazo("Gasto " + (i + 1) + ": escribe en qué se gastó.");
      return [{
        documento: String(p.documento ?? "").trim().slice(0, 40) || null,
        concepto,
        categoria: p.categoria && esCategoriaPago(p.categoria) ? p.categoria : categoriaDePago(concepto, equipo.map((s) => s.name)),
        valor,
      }];
    });

    const entregadoTexto = String(pedido.entregado ?? "").trim();
    const datos = {
      acompanante: String(pedido.acompanante ?? "").trim().slice(0, 60) || null,
      otrosDescuentos: plataDe(pedido.otrosDescuentos, "Otros descuentos"),
      entregado: plataDe(entregadoTexto, "Efectivo entregado"),
      entregadoDetalle: esSuma(entregadoTexto) ? entregadoTexto.replace(/\s/g, "") : null,
      notes: String(pedido.notes ?? "").trim().slice(0, 500) || null,
    };

    // En lote: una consulta por fila no alcanza con la base lejos (Vercel).
    await db.$transaction(
      async (tx) => {
        const clientesNuevos = [...nuevosClientes].map(([k, name]) => ({ id: crypto.randomUUID(), userId: user.id, name, nameKey: k, staffId: planilla.staffId }));
        await tx.repartoCliente.createMany({ data: clientesNuevos });
        for (const c of clientesNuevos) clienteId.set(c.nameKey, c.id);

        // Lineas: una por producto. Nada las nombra, asi que se reescriben.
        await tx.repartoLinea.deleteMany({ where: { planillaId: planilla.id, userId: user.id } });
        await tx.repartoLinea.createMany({ data: lineas.map((l) => ({ userId: user.id, planillaId: planilla.id, ...l })) });

        // Creditos: se corrigen en su sitio, porque los cobros de otros dias los nombran.
        const quedan = creditos.flatMap((c) => (c.id ? [c.id] : []));
        await tx.repartoCredito.deleteMany({ where: { planillaId: planilla.id, userId: user.id, id: { notIn: quedan } } });
        const creditosNuevos: Prisma.RepartoCreditoCreateManyInput[] = [];
        for (const [i, c] of creditos.entries()) {
          const data = { clienteId: clienteId.get(c.clienteKey)!, day: c.day, documento: c.documento, factura: c.factura, valor: c.valor, position: i };
          const viejo = c.id ? planilla.creditos.find((x) => x.id === c.id) : undefined;
          if (!viejo) {
            c.id = crypto.randomUUID();
            creditosNuevos.push({ id: c.id, userId: user.id, planillaId: planilla.id, ...data });
          } else if ((Object.keys(data) as (keyof typeof data)[]).some((k) => viejo[k] !== data[k])) {
            await tx.repartoCredito.update({ where: { id: viejo.id }, data });
          }
        }
        await tx.repartoCredito.createMany({ data: creditosNuevos });

        // Cobros: a su documento. El que no se encuentra queda como abono a la
        // cuenta del cliente y se marca para revisar.
        await tx.repartoCobro.deleteMany({ where: { planillaId: planilla.id, userId: user.id } });
        // Lo que deben los clientes de estos cobros, documento por documento,
        // con lo ya cobrado; los cobros de esta planilla se restan aqui mismo.
        const idsClientes = [...new Set(cobros.flatMap((c) => (c.tipo === "COBRO" && c.clienteKey ? [clienteId.get(c.clienteKey)!] : [])))];
        const deudas = (
          idsClientes.length === 0
            ? []
            : await tx.repartoCredito.findMany({
                where: { userId: user.id, clienteId: { in: idsClientes }, OR: [{ planillaId: null }, { planilla: { estado: { not: "ANULADA" } } }] },
                select: {
                  id: true,
                  clienteId: true,
                  valor: true,
                  documento: true,
                  cobros: { where: { planilla: { estado: { not: "ANULADA" } } }, select: { valor: true } },
                },
                orderBy: { day: "asc" },
              })
        ).map((x) => ({ ...x, saldo: x.valor - x.cobros.reduce((s, y) => s + y.valor, 0) }));
        const negativos: string[] = [];
        const filas = cobros.map((c, i) => {
          const idCliente = c.clienteKey ? clienteId.get(c.clienteKey)! : null;
          const credito = c.tipo === "COBRO" && idCliente ? creditoDelCobro(deudas.filter((x) => x.clienteId === idCliente), c) : null;
          if (credito) {
            if (c.valor > credito.saldo) negativos.push("el cobro " + (i + 1) + " deja el documento " + (credito.documento ?? "") + " en negativo");
            credito.saldo -= c.valor;
          }
          if (c.tipo === "COBRO" && !credito) avisos.push("Cobro " + (i + 1) + ": no encontré el documento; quedó como abono a la cuenta del cliente.");
          return {
            userId: user.id,
            planillaId: planilla.id,
            clienteId: idCliente,
            creditoId: credito?.id ?? null,
            fechaDocumento: c.fechaDocumento,
            documento: c.documento,
            factura: c.factura,
            valor: c.valor,
            tipo: c.tipo,
            revisar: c.tipo === "COBRO" && !credito,
            position: i,
          };
        });
        if (negativos.length && !pedido.confirmado) {
          throw new Rechazo("CONFIRMAR:" + negativos.join("; ") + ".");
        }
        await tx.repartoCobro.createMany({ data: filas });

        await tx.repartoPago.deleteMany({ where: { planillaId: planilla.id, userId: user.id } });
        await tx.repartoPago.createMany({ data: pagos.map((p, i) => ({ userId: user.id, planillaId: planilla.id, ...p, position: i })) });

        await tx.repartoPlanilla.update({ where: { id: planilla.id }, data: datos });
      },
      { timeout: 20_000, maxWait: 10_000 }
    );
    creditosIds = creditos.map((c) => c.id!);
  } catch (e) {
    if (e instanceof Rechazo) {
      return e.message.startsWith("CONFIRMAR:")
        ? { confirmar: "Ojo: " + e.message.slice(10) + " ¿Guardar igual?" }
        : { error: e.message };
    }
    throw e;
  }

  revalidatePath(RUTA);
  revalidatePath(RUTA + "/" + planilla.id);
  return { ok: "Planilla guardada.", avisos, creditosIds };
}

async function cambiarEstado(id: string, cambio: "cerrar" | "reabrir" | "anular", motivo: string): Promise<RepartoState> {
  const sesion = await acceso();
  if (!sesion) return { error: SIN_ACCESO };
  const { user, staff } = sesion;
  const planilla = await db.repartoPlanilla.findFirst({ where: { id, userId: user.id }, select: { id: true, estado: true, auditoria: true } });
  if (!planilla) return { error: "No encontramos esa planilla." };
  const ahora = new Date();
  const nota = (que: string) =>
    ((planilla.auditoria ? planilla.auditoria + "\n" : "") +
      dayIn(ahora, user.timezone) + " " + timeIn(ahora, user.timezone) + " · " + staff.name + " " + que + (motivo ? ": " + motivo : "")).slice(-4000);

  if (cambio === "cerrar") {
    if (planilla.estado !== "BORRADOR") return { error: "Solo se cierra una planilla abierta." };
    await db.repartoPlanilla.update({ where: { id }, data: { estado: "CERRADA", closedAt: new Date(), closedById: staff.id } });
  } else if (cambio === "reabrir") {
    if (planilla.estado === "BORRADOR") return { error: "Ya está abierta." };
    if (!motivo) return { error: "Escribe por qué se reabre: queda anotado." };
    await db.repartoPlanilla.update({ where: { id }, data: { estado: "BORRADOR", closedAt: null, closedById: null, auditoria: nota("la reabrió") } });
  } else {
    if (planilla.estado === "ANULADA") return { error: "Ya está anulada." };
    if (!motivo) return { error: "Escribe por qué se anula: queda anotado." };
    const bloqueo = await porQueNoSeAnula(user.id, id);
    if (bloqueo) return { error: bloqueo };
    await db.repartoPlanilla.update({ where: { id }, data: { estado: "ANULADA", auditoria: nota("la anuló") } });
  }
  revalidatePath(RUTA);
  revalidatePath(RUTA + "/" + id);
  return { ok: cambio === "cerrar" ? "Planilla cerrada." : cambio === "reabrir" ? "Planilla reabierta." : "Planilla anulada." };
}

export async function cerrarPlanillaAction(_prev: RepartoState, formData: FormData): Promise<RepartoState> {
  return cambiarEstado(str(formData.get("id")), "cerrar", "");
}

export async function reabrirPlanillaAction(_prev: RepartoState, formData: FormData): Promise<RepartoState> {
  return cambiarEstado(str(formData.get("id")), "reabrir", texto(formData.get("motivo"), 300));
}

export async function anularPlanillaAction(_prev: RepartoState, formData: FormData): Promise<RepartoState> {
  return cambiarEstado(str(formData.get("id")), "anular", texto(formData.get("motivo"), 300));
}

/** Borrar del todo: solo una planilla abierta cuyos creditos nadie haya cobrado. */
export async function borrarPlanillaAction(formData: FormData) {
  const sesion = await acceso();
  if (!sesion) return;
  const { user } = sesion;
  const id = str(formData.get("id"));
  const planilla = await db.repartoPlanilla.findFirst({
    where: { id, userId: user.id, estado: "BORRADOR" },
    include: { creditos: { include: { cobros: { select: { planillaId: true } } } } },
  });
  if (!planilla || planilla.creditos.some((c) => c.cobros.some((x) => x.planillaId !== id))) return;
  await db.repartoPlanilla.delete({ where: { id: planilla.id } });
  revalidatePath(RUTA);
  redirect(RUTA);
}

// ------------------------------------------------------------- mantenimiento

/** Producto nuevo o corregido. Un precio distinto se guarda en el historial desde el dia que se diga. */
export async function guardarProductoAction(_prev: RepartoState, formData: FormData): Promise<RepartoState> {
  const sesion = await acceso();
  if (!sesion) return { error: SIN_ACCESO };
  const { user } = sesion;
  const id = str(formData.get("id"));
  const name = str(formData.get("name"), "", 80).replace(/\s+/g, " ");
  if (!name) return { error: "Escribe el nombre del producto." };
  const precio = evaluarSuma(str(formData.get("price")));
  if (!Number.isFinite(precio) || precio < 0) return { error: "Revisa el precio." };
  const price = aCentavos(precio);
  const desde = str(formData.get("desde"));
  const dia = isValidDay(desde) ? desde : todayIn(user.timezone);
  const serviceId = str(formData.get("serviceId")) || null;
  if (serviceId && !(await db.service.findFirst({ where: { id: serviceId, userId: user.id }, select: { id: true } }))) {
    return { error: "Ese producto de Inventario no existe." };
  }
  const nameKey = claveDe(name);
  const choca = await db.repartoProducto.findFirst({ where: { userId: user.id, nameKey, NOT: id ? { id } : undefined }, select: { id: true } });
  if (choca) return { error: "Ya hay un producto con ese nombre." };
  // El formulario manda "off" siempre y "on" solo con la casilla marcada.
  const active = formData.getAll("active").includes("on");

  if (id) {
    const producto = await db.repartoProducto.findFirst({ where: { id, userId: user.id }, select: { id: true, price: true } });
    if (!producto) return { error: "No encontramos ese producto." };
    await db.$transaction([
      db.repartoProducto.update({ where: { id }, data: { name, nameKey, price, active, serviceId } }),
      ...(producto.price !== price
        ? [db.repartoPrecio.upsert({ where: { productoId_desde: { productoId: id, desde: dia } }, create: { userId: user.id, productoId: id, price, desde: dia }, update: { price } })]
        : []),
    ]);
  } else {
    const ultimo = await db.repartoProducto.findMany({ where: { userId: user.id }, select: { code: true, position: true } });
    const n = Math.max(0, ...ultimo.map((p) => Number(p.code.replace(/\D/g, "")) || 0)) + 1;
    const nuevo = await db.repartoProducto.create({
      data: { userId: user.id, code: "P" + String(n).padStart(3, "0"), name, nameKey, price, active, serviceId, position: Math.max(0, ...ultimo.map((p) => p.position)) + 1 },
    });
    await db.repartoPrecio.create({ data: { userId: user.id, productoId: nuevo.id, price, desde: dia } });
  }
  revalidatePath(RUTA + "/productos");
  return { ok: id ? "Producto guardado." : name + " quedó en el catálogo." };
}

export async function guardarClienteAction(_prev: RepartoState, formData: FormData): Promise<RepartoState> {
  const sesion = await acceso();
  if (!sesion) return { error: SIN_ACCESO };
  const { user } = sesion;
  const id = str(formData.get("id"));
  const name = str(formData.get("name"), "", 120).replace(/\s+/g, " ");
  if (!name) return { error: "Escribe el nombre del cliente." };
  const nameKey = claveDe(name);
  const choca = await db.repartoCliente.findFirst({ where: { userId: user.id, nameKey, NOT: id ? { id } : undefined }, select: { id: true } });
  if (choca) return { error: "Ya hay un cliente con ese nombre." };
  const staffId = str(formData.get("staffId")) || null;
  if (staffId && !(await db.staff.findFirst({ where: { id: staffId, userId: user.id }, select: { id: true } }))) {
    return { error: "Ese vendedor no existe." };
  }
  const datos = { name, nameKey, staffId, notes: texto(formData.get("notes"), 300) || null };
  if (id) {
    const r = await db.repartoCliente.updateMany({ where: { id, userId: user.id }, data: datos });
    if (r.count === 0) return { error: "No encontramos ese cliente." };
  } else {
    await db.repartoCliente.create({ data: { userId: user.id, ...datos } });
  }
  revalidatePath(RUTA + "/clientes");
  revalidatePath(RUTA + "/cartera");
  return { ok: id ? "Cliente guardado." : name + " quedó en la lista." };
}

/**
 * Juntar dos clientes que son el mismo ("BARBERIA MOSTACH" y "BARBERÍA
 * MOSTACHE"): sus creditos y cobros pasan al que queda. Lo decide la
 * administradora, nunca se hace solo.
 */
export async function unirClientesAction(_prev: RepartoState, formData: FormData): Promise<RepartoState> {
  const sesion = await acceso();
  if (!sesion) return { error: SIN_ACCESO };
  const { user } = sesion;
  const queda = str(formData.get("queda"));
  const sale = str(formData.get("sale"));
  if (!queda || !sale || queda === sale) return { error: "Escoge dos clientes distintos." };
  const [a, b] = await Promise.all([
    db.repartoCliente.findFirst({ where: { id: queda, userId: user.id }, select: { id: true, name: true } }),
    db.repartoCliente.findFirst({ where: { id: sale, userId: user.id }, select: { id: true, name: true } }),
  ]);
  if (!a || !b) return { error: "No encontramos esos clientes." };
  await db.$transaction([
    db.repartoCredito.updateMany({ where: { userId: user.id, clienteId: b.id }, data: { clienteId: a.id } }),
    db.repartoCobro.updateMany({ where: { userId: user.id, clienteId: b.id }, data: { clienteId: a.id } }),
    db.repartoCliente.delete({ where: { id: b.id } }),
  ]);
  revalidatePath(RUTA + "/clientes");
  revalidatePath(RUTA + "/cartera");
  return { ok: b.name + " quedó junto con " + a.name + "." };
}

// ----------------------------------------------------------------- importar

/** Lo que deja subir una accion del servidor (next.config: bodySizeLimit 2mb), con margen. */
const MAX_EXCEL = 1.9 * 1024 * 1024;

/**
 * Importar un Excel con el formato de "VENTAS REPARTO". Sin `aplicar` es un
 * ensayo: no escribe nada (ver lib/reparto-importar.ts).
 */
export async function importarExcelAction(
  formData: FormData
): Promise<{ error?: string; reporte?: ReporteImportacion; claves?: string[]; vendedores?: Record<string, string> }> {
  const sesion = await acceso();
  if (!sesion) return { error: SIN_ACCESO };
  const { user, staff } = sesion;
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Escoge el archivo de Excel." };
  if (archivo.size > MAX_EXCEL) return { error: "El archivo pesa más de 2 MB. Quítale las hojas que no son de reparto y vuelve a intentarlo." };
  let vendedores: Record<string, string> = {};
  try {
    vendedores = JSON.parse(String(formData.get("vendedores") ?? "{}"));
  } catch {
    vendedores = {};
  }
  let libro;
  try {
    libro = leerExcelReparto(new Uint8Array(await archivo.arrayBuffer()), { fechas: FECHAS_CORREGIDAS });
  } catch {
    return { error: "No se pudo leer ese archivo. ¿Es un Excel (.xlsx)?" };
  }
  if (libro.planillas.length === 0) return { error: "No encontré ningún día de reparto en ese Excel (bloques que empiecen con VENDEDOR)." };
  const claves = [...new Set(libro.planillas.map(claveVendedor))];
  // Quien es cada hoja: lo que ya se escogio, y si no, el nombre de pila (JAVIER es Javier).
  const equipo = await db.staff.findMany({ where: { userId: user.id, deletedAt: null }, select: { id: true, name: true } });
  for (const k of claves) {
    if (!vendedores[k] || !equipo.some((s) => s.id === vendedores[k])) vendedores[k] = sugerirVendedor(k, equipo) ?? "";
  }
  try {
    const reporte = await importarReparto(db, {
      userId: user.id,
      libro,
      catalogo: catalogoExcel as ProductoCatalogo[],
      vendedores,
      aplicar: formData.get("aplicar") === "1",
      staffId: staff.id,
    });
    if (reporte.aplicado) revalidatePath(RUTA, "layout");
    return { reporte, claves, vendedores };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo importar. No se guardó nada." };
  }
}
