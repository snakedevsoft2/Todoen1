import "server-only";
import { db } from "@/lib/db";

/**
 * Lo que ve el administrador de la plataforma.
 *
 * Regla de la casa, y es la mas importante de este archivo: aqui solo se leen
 * *datos de la cuenta y cuentas de cuantos*. Nunca el contenido.
 *
 * O sea: cuantas ventas tiene un negocio, si. Que vendio, a quien, por cuanto
 * y a que cliente, no. Ni sus deudores, ni sus fotos, ni sus precios. A los
 * clientes se les prometio que nadie ve lo suyo, y un panel de administracion
 * no es una excusa para romper esa promesa: es donde mas facil seria romperla
 * sin darse cuenta.
 *
 * Si algun dia hay que mirar el contenido de una cuenta para resolverle un
 * problema, que sea con permiso de esa persona y por un camino aparte que
 * quede registrado. No por aqui.
 */

const DIA = 24 * 60 * 60 * 1000;

export type ResumenPlataforma = {
  negocios: number;
  suspendidos: number;
  personas: number;
  conAcceso: number;
  activosHoy: number;
  activos7: number;
  activos30: number;
  nuevos30: number;
  /** Se registraron y nunca volvieron a entrar. */
  dormidos: number;
};

export async function resumenPlataforma(): Promise<ResumenPlataforma> {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hace7 = new Date(Date.now() - 7 * DIA);
  const hace30 = new Date(Date.now() - 30 * DIA);

  const [negocios, suspendidos, personas, conAcceso, activosHoy, activos7, activos30, nuevos30] =
    await Promise.all([
      db.user.count(),
      db.user.count({ where: { suspendedAt: { not: null } } }),
      db.staff.count(),
      db.staff.count({ where: { email: { not: null }, active: true } }),
      db.staff.count({ where: { lastSeenAt: { gte: hoy } } }),
      db.staff.count({ where: { lastSeenAt: { gte: hace7 } } }),
      db.staff.count({ where: { lastSeenAt: { gte: hace30 } } }),
      db.user.count({ where: { createdAt: { gte: hace30 } } }),
    ]);

  // Negocios donde nadie ha entrado nunca. Es el numero que de verdad duele y
  // el que hay que mirar primero: son los que se registraron y no volvieron.
  const dormidos = await db.user.count({
    where: { staff: { every: { lastSeenAt: null } } },
  });

  return {
    negocios,
    suspendidos,
    personas,
    conAcceso,
    activosHoy,
    activos7,
    activos30,
    nuevos30,
    dormidos,
  };
}

export type FilaCuenta = {
  id: string;
  businessName: string;
  businessType: string;
  email: string;
  phone: string | null;
  createdAt: Date;
  suspendedAt: Date | null;
  personas: number;
  conAcceso: number;
  /** La ultima vez que entro cualquiera de esa cuenta. */
  ultimoAcceso: Date | null;
  /** Cuantas cosas ha registrado. No que cosas. */
  movimientos: number;
  apagados: number;
};

/** Todas las cuentas, con lo justo para poder decidir a cual entrar. */
export async function listaDeCuentas(busqueda = ""): Promise<FilaCuenta[]> {
  const q = busqueda.trim();
  const users = await db.user.findMany({
    where: q
      ? {
          OR: [
            { businessName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { ownerName: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      id: true,
      businessName: true,
      businessType: true,
      email: true,
      phone: true,
      createdAt: true,
      suspendedAt: true,
      staff: { select: { email: true, lastSeenAt: true, active: true } },
      _count: { select: { sales: true, expenses: true, services: true, debts: true } },
      accountModules: { where: { enabled: false }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return users.map((u) => {
    const vistas = u.staff.map((s) => s.lastSeenAt).filter((d): d is Date => Boolean(d));
    return {
      id: u.id,
      businessName: u.businessName,
      businessType: u.businessType,
      email: u.email,
      phone: u.phone,
      createdAt: u.createdAt,
      suspendedAt: u.suspendedAt,
      personas: u.staff.length,
      conAcceso: u.staff.filter((s) => s.email && s.active).length,
      ultimoAcceso: vistas.length
        ? new Date(Math.max(...vistas.map((d) => d.getTime())))
        : null,
      movimientos:
        u._count.sales + u._count.expenses + u._count.services + u._count.debts,
      apagados: u.accountModules.length,
    };
  });
}

export type DetalleCuenta = NonNullable<Awaited<ReturnType<typeof detalleDeCuenta>>>;

/** Una cuenta por dentro: quien la usa y cuanto la usa. Nunca que hay dentro. */
export async function detalleDeCuenta(id: string) {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      businessName: true,
      businessType: true,
      ownerName: true,
      email: true,
      phone: true,
      slug: true,
      createdAt: true,
      suspendedAt: true,
      suspendedReason: true,
      publicOpen: true,
      staff: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          lastSeenAt: true,
          onboardingDoneAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: {
          sales: true,
          expenses: true,
          services: true,
          debts: true,
          appointments: true,
          orders: true,
          variants: true,
          suppliers: true,
        },
      },
    },
  });
  if (!user) return null;

  const [overrides, delOficio, usoCrudo] = await Promise.all([
    db.accountModule.findMany({ where: { userId: id } }),
    db.businessTypeModule.findMany({
      where: { businessType: user.businessType, module: { active: true } },
      include: { module: true },
      orderBy: { sortOrder: "asc" },
    }),
    // Cuantos dias distintos se abrio cada apartado. Es la respuesta a "que
    // tanto usan esto", sin mirar una sola fila de su contenido.
    db.moduleEvent.groupBy({
      by: ["moduleKey"],
      where: { userId: id },
      _count: { moduleKey: true },
      _max: { createdAt: true },
    }),
  ]);

  const porLlave = new Map(overrides.map((o) => [o.moduleKey, o]));
  const uso = new Map(
    usoCrudo.map((u) => [u.moduleKey, { dias: u._count.moduleKey, ultima: u._max.createdAt }])
  );

  const modulos = delOficio.map((f) => ({
    key: f.module.key,
    label: f.labelOverride ?? f.module.label,
    icon: f.module.icon,
    group: f.module.group as string,
    short: f.module.shortDescription,
    fixed: f.module.fixed,
    deFabrica: f.enabledByDefault,
    /** null = sin tocar por el administrador. */
    override: porLlave.get(f.module.key)?.enabled ?? null,
    nota: porLlave.get(f.module.key)?.note ?? null,
    diasUsado: uso.get(f.module.key)?.dias ?? 0,
    ultimaVez: uso.get(f.module.key)?.ultima ?? null,
  }));

  const vistas = user.staff.map((s) => s.lastSeenAt).filter((d): d is Date => Boolean(d));

  return {
    ...user,
    modulos,
    ultimoAcceso: vistas.length ? new Date(Math.max(...vistas.map((d) => d.getTime()))) : null,
  };
}
