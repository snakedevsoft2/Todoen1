import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { esEtapa, llaveNombre, llaveTelefono, type Etapa } from "./crm";

/**
 * La ficha unica del cliente, del lado de la base de datos.
 *
 * Todo lo de aqui recibe el id del negocio y filtra por el en cada consulta.
 * No hay forma de pedir un cliente "suelto": el aislamiento no puede depender
 * de que quien llame se acuerde.
 */

export type Origen =
  | "manual"
  | "importado"
  | "reserva"
  | "turno"
  | "cartera"
  | "reporte"
  | "chat"
  | "whatsapp";

/** Tope por negocio. Muy por encima de lo normal; frena un bucle, no a nadie. */
export const LIMITE_CLIENTES = 20_000;

/**
 * Deja anotado a un cliente y devuelve su id.
 *
 * Lo llaman la reserva, el turno, la deuda y el reporte cada vez que alguien
 * escribe un nombre: asi la lista de clientes se llena sola sin pedirle a
 * nadie que la mantenga.
 *
 * Si el telefono ya existe, es el mismo cliente y no se toca nada. Si llega
 * con telefono y hay alguien con el mismo nombre pero sin telefono, se le
 * pone el numero a ese en vez de crear otro. Si no hay telefono, se reusa al
 * del mismo nombre, que es lo mejor que se puede hacer sin mas datos.
 *
 * Nunca lanza: anotar al cliente es un extra y no puede tumbar la reserva.
 */
export async function anotarCliente(
  userId: string,
  datos: { name: string; phone?: string | null; source: Origen }
): Promise<string | null> {
  const name = datos.name.trim().slice(0, 200);
  if (!name) return null;
  const phone = datos.phone?.trim().slice(0, 40) || null;
  const phoneKey = llaveTelefono(phone);

  const porTelefono = () =>
    phoneKey
      ? db.customer.findUnique({
          where: { userId_phoneKey: { userId, phoneKey } },
          select: { id: true },
        })
      : Promise.resolve(null);

  try {
    const mismo = await porTelefono();
    if (mismo) return mismo.id;

    const mismoNombre = await db.customer.findFirst({
      where: { userId, name: { equals: name, mode: "insensitive" }, phoneKey: null },
      select: { id: true },
    });
    if (mismoNombre) {
      if (phoneKey) {
        await db.customer.update({ where: { id: mismoNombre.id }, data: { phone, phoneKey } });
      }
      return mismoNombre.id;
    }

    // Sin telefono y con el nombre ya tomado por alguien que si tiene: es la
    // misma persona anotada sin numero esta vez.
    if (!phoneKey) {
      const conNumero = await db.customer.findFirst({
        where: { userId, name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      if (conNumero) return conNumero.id;
    }

    const cuantos = await db.customer.count({ where: { userId } });
    if (cuantos >= LIMITE_CLIENTES) return null;

    const nuevo = await db.customer.create({
      data: { userId, name, phone, phoneKey, source: datos.source },
      select: { id: true },
    });
    return nuevo.id;
  } catch {
    // Dos reservas del mismo numero al mismo tiempo: la otra gano la carrera
    // y el cliente ya existe.
    const otra = await porTelefono().catch(() => null);
    return otra?.id ?? null;
  }
}

type Candidato = { name: string; phone: string | null; source: Origen };

/**
 * Crea las fichas de los clientes que ya estaban regados por la aplicacion.
 *
 * Es para el negocio que lleva meses usandola: sus clientes estan en los
 * turnos, las deudas y los reportes, y no tiene sentido pedirle que los vuelva
 * a escribir. Se puede correr las veces que sea: el que ya tiene ficha no se
 * duplica.
 */
export async function importarClientes(userId: string): Promise<{ creados: number; revisados: number }> {
  const TOMA = 5000;
  const [citas, deudas, reportes, ventas, existentes] = await Promise.all([
    db.appointment.findMany({
      where: { userId },
      select: { clientName: true, clientPhone: true },
      orderBy: { createdAt: "desc" },
      take: TOMA,
    }),
    db.debt.findMany({
      where: { userId },
      select: { clientName: true, clientPhone: true },
      orderBy: { createdAt: "desc" },
      take: TOMA,
    }),
    db.visitReport.findMany({
      where: { userId, clientName: { not: null } },
      select: { clientName: true, clientPhone: true },
      orderBy: { createdAt: "desc" },
      take: TOMA,
    }),
    db.sale.findMany({
      where: { userId, clientName: { not: null } },
      select: { clientName: true },
      orderBy: { createdAt: "desc" },
      take: TOMA,
    }),
    db.customer.findMany({ where: { userId }, select: { name: true, phoneKey: true } }),
  ]);

  const candidatos: Candidato[] = [
    ...citas.map((c) => ({ name: c.clientName, phone: c.clientPhone, source: "turno" as const })),
    ...deudas.map((d) => ({ name: d.clientName, phone: d.clientPhone, source: "cartera" as const })),
    ...reportes.map((r) => ({ name: r.clientName ?? "", phone: r.clientPhone, source: "reporte" as const })),
    ...ventas.map((v) => ({ name: v.clientName ?? "", phone: null, source: "importado" as const })),
  ];

  const telefonos = new Set(existentes.map((e) => e.phoneKey).filter((k): k is string => Boolean(k)));
  const nombres = new Set(existentes.map((e) => llaveNombre(e.name)));

  // Primero los que traen telefono: si la misma persona aparece con numero en
  // un turno y sin numero en una venta, la ficha tiene que quedar con numero.
  candidatos.sort((a, b) => Number(Boolean(llaveTelefono(b.phone))) - Number(Boolean(llaveTelefono(a.phone))));

  const nuevos: Prisma.CustomerCreateManyInput[] = [];
  let revisados = 0;
  for (const c of candidatos) {
    const name = c.name.trim().slice(0, 200);
    // "Cliente", "-" y compania no son nombres de nadie.
    if (name.length < 2 || /^(cliente|consumidor final|-+)$/i.test(name)) continue;
    revisados += 1;

    const phoneKey = llaveTelefono(c.phone);
    const nombre = llaveNombre(name);
    if (phoneKey ? telefonos.has(phoneKey) : nombres.has(nombre)) continue;

    if (phoneKey) telefonos.add(phoneKey);
    nombres.add(nombre);
    nuevos.push({
      userId,
      name,
      phone: phoneKey ? c.phone!.trim().slice(0, 40) : null,
      phoneKey,
      source: c.source,
    });
  }

  const cupo = Math.max(0, LIMITE_CLIENTES - existentes.length);
  const aCrear = nuevos.slice(0, cupo);
  if (aCrear.length > 0) {
    await db.customer.createMany({ data: aCrear, skipDuplicates: true });
  }
  return { creados: aCrear.length, revisados };
}

/**
 * Si un registro suelto (un turno, una deuda) es de este cliente.
 *
 * El telefono manda. El nombre solo cuenta cuando el registro no trae un
 * telefono distinto: dos "Carlos" con numeros diferentes son dos personas.
 */
export function esDelCliente(
  cliente: { name: string; phoneKey: string | null },
  registro: { clientName: string | null; clientPhone?: string | null }
): boolean {
  const suTelefono = llaveTelefono(registro.clientPhone);
  if (cliente.phoneKey && suTelefono) return suTelefono === cliente.phoneKey;
  return llaveNombre(registro.clientName) === llaveNombre(cliente.name);
}

/** Lo que el cliente ha hecho en el resto de la aplicacion. */
export async function historialDe(userId: string, cliente: { name: string; phoneKey: string | null }) {
  const porNombre = { clientName: { equals: cliente.name, mode: "insensitive" as const } };
  // La base no sabe sacar los ultimos diez digitos, asi que se piden los que
  // terminan igual y el filtro fino se hace aqui con esDelCliente.
  const porTelefono = cliente.phoneKey ? [{ clientPhone: { endsWith: cliente.phoneKey.slice(-4) } }] : [];

  const [citas, deudas, ventas, reportes] = await Promise.all([
    db.appointment.findMany({
      where: { userId, OR: [porNombre, ...porTelefono] },
      select: {
        id: true,
        clientName: true,
        clientPhone: true,
        day: true,
        startTime: true,
        serviceName: true,
        status: true,
        price: true,
      },
      orderBy: [{ day: "desc" }, { startTime: "desc" }],
      take: 200,
    }),
    db.debt.findMany({
      where: { userId, OR: [porNombre, ...porTelefono] },
      select: {
        id: true,
        clientName: true,
        clientPhone: true,
        concept: true,
        amount: true,
        day: true,
        status: true,
        payments: { select: { amount: true } },
      },
      orderBy: { day: "desc" },
      take: 200,
    }),
    // La venta no guarda telefono: solo se puede reconocer por nombre.
    db.sale.findMany({
      where: { userId, ...porNombre },
      select: { id: true, clientName: true, day: true, total: true },
      orderBy: { day: "desc" },
      take: 200,
    }),
    db.visitReport.findMany({
      where: { userId, OR: [porNombre, ...porTelefono] },
      select: { id: true, clientName: true, clientPhone: true, day: true, title: true },
      orderBy: { day: "desc" },
      take: 100,
    }),
  ]);

  const suyas = <T extends { clientName: string | null; clientPhone?: string | null }>(filas: T[]) =>
    filas.filter((f) => esDelCliente(cliente, f));

  const misDeudas = suyas(deudas).map((d) => ({
    ...d,
    saldo:
      d.status === "PENDIENTE"
        ? Math.max(0, d.amount - d.payments.reduce((s, p) => s + p.amount, 0))
        : 0,
  }));
  const misVentas = suyas(ventas);

  return {
    citas: suyas(citas),
    deudas: misDeudas,
    ventas: misVentas,
    reportes: suyas(reportes),
    totalComprado: misVentas.reduce((s, v) => s + v.total, 0),
    saldoPendiente: misDeudas.reduce((s, d) => s + d.saldo, 0),
  };
}

export type FiltroSegmento = {
  q?: string;
  etiquetas?: string[];
  etapa?: Etapa | null;
  /** Solo los que llevan al menos estos dias sin contacto (o nunca). */
  sinContactoDias?: number | null;
  conPendientes?: boolean;
};

/** Traduce los filtros de la pantalla de segmentos a una consulta. */
export function whereDeSegmento(
  userId: string,
  filtro: FiltroSegmento,
  ahora = new Date()
): Prisma.CustomerWhereInput {
  const y: Prisma.CustomerWhereInput[] = [{ userId }];

  const q = filtro.q?.trim();
  if (q) {
    y.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { email: { contains: q, mode: "insensitive" } },
        { document: { contains: q } },
      ],
    });
  }

  // Cada etiqueta es un requisito mas: "VIP" y "Moroso" son los que tienen
  // las dos, no los que tienen cualquiera.
  for (const tagId of filtro.etiquetas ?? []) {
    y.push({ tags: { some: { tagId, userId } } });
  }

  if (filtro.etapa && esEtapa(filtro.etapa)) {
    y.push({ deals: { some: { stage: filtro.etapa } } });
  }

  if (filtro.sinContactoDias && filtro.sinContactoDias > 0) {
    const corte = new Date(ahora.getTime() - filtro.sinContactoDias * 86_400_000);
    y.push({ OR: [{ lastContactAt: null }, { lastContactAt: { lt: corte } }] });
  }

  if (filtro.conPendientes) {
    y.push({ followUps: { some: { doneAt: null } } });
  }

  return { AND: y };
}
