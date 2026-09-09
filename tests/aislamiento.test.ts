import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Aislamiento entre cuentas.
 *
 * Estas pruebas existen para que el aislamiento deje de depender de que quien
 * escriba una consulta se acuerde de filtrar. Crean dos negocios con datos
 * parecidos y comprueban que ninguno alcanza una sola fila del otro.
 *
 * Corren contra la base de datos de verdad y limpian lo suyo al terminar.
 */
const db = new PrismaClient();

const SUFIJO = "aislamiento-" + Date.now();
const correo = (n: string) => n + "-" + SUFIJO + "@test.local";

type Cuenta = { id: string; saleId: string; saleItemId: string; serviceId: string; debtId: string };

async function crearCuenta(nombre: string): Promise<Cuenta> {
  const user = await db.user.create({
    data: {
      email: correo(nombre),
      passwordHash: "x",
      ownerName: nombre,
      businessName: "Negocio " + nombre,
      businessType: "ROPA",
      slug: nombre + "-" + SUFIJO,
    },
  });

  // La persona que atiende. El espacio de trabajo cuelga de ella, no del
  // negocio, asi que sin Staff no hay nada que aislar en ese frente.
  await db.staff.create({
    data: { userId: user.id, name: "Duena " + nombre, role: "DUENO" },
  });

  const service = await db.service.create({
    data: { userId: user.id, name: "Camisa de " + nombre, price: 50000, category: "Camisas" },
  });

  const sale = await db.sale.create({
    data: {
      userId: user.id,
      day: "2026-09-09",
      total: 50000,
      items: {
        create: [{ userId: user.id, serviceId: service.id, name: "Camisa", unitPrice: 50000, qty: 1 }],
      },
    },
    include: { items: true },
  });

  const debt = await db.debt.create({
    data: {
      userId: user.id,
      clientName: "Cliente de " + nombre,
      concept: "Fiado",
      amount: 30000,
      day: "2026-09-09",
    },
  });

  return {
    id: user.id,
    saleId: sale.id,
    saleItemId: sale.items[0].id,
    serviceId: service.id,
    debtId: debt.id,
  };
}

let A: Cuenta;
let B: Cuenta;

beforeAll(async () => {
  A = await crearCuenta("a");
  B = await crearCuenta("b");
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { contains: SUFIJO } } });
  await db.$disconnect();
});

describe("una cuenta no alcanza los datos de otra", () => {
  it("las ventas de A no traen ninguna fila de B", async () => {
    const ventas = await db.sale.findMany({ where: { userId: A.id } });
    expect(ventas.length).toBeGreaterThan(0);
    expect(ventas.some((v) => v.userId === B.id)).toBe(false);
  });

  it("las lineas de venta ya llevan dueno propio y no se cruzan", async () => {
    const lineas = await db.saleItem.findMany({ where: { userId: A.id } });
    expect(lineas.length).toBeGreaterThan(0);
    expect(lineas.every((l) => l.userId === A.id)).toBe(true);

    // Y filtrando por el dueno no aparece la linea de B.
    expect(lineas.some((l) => l.id === B.saleItemId)).toBe(false);
  });

  it("el catalogo de A no trae productos de B", async () => {
    const productos = await db.service.findMany({ where: { userId: A.id } });
    expect(productos.some((p) => p.id === B.serviceId)).toBe(false);
  });

  it("la cartera de A no trae deudas de B", async () => {
    const deudas = await db.debt.findMany({ where: { userId: A.id } });
    expect(deudas.some((d) => d.id === B.debtId)).toBe(false);
  });

  it("cada linea de venta pertenece al mismo dueno que su venta", async () => {
    const cruzadas = await db.$queryRaw<{ n: number }[]>`
      select count(*)::int as n
        from "SaleItem" si
        join "Sale" s on s.id = si."saleId"
       where si."userId" <> s."userId"`;
    expect(cruzadas[0].n).toBe(0);
  });

  it("cada linea de cuenta pertenece al mismo dueno que su cuenta", async () => {
    const cruzadas = await db.$queryRaw<{ n: number }[]>`
      select count(*)::int as n
        from "OrderItem" oi
        join "Order" o on o.id = oi."orderId"
       where oi."userId" <> o."userId"`;
    expect(cruzadas[0].n).toBe(0);
  });
});

describe("pedir un id de otra cuenta no devuelve nada", () => {
  it("la venta de B no aparece buscando como A", async () => {
    const venta = await db.sale.findFirst({ where: { id: B.saleId, userId: A.id } });
    expect(venta).toBeNull();
  });

  it("el producto de B no aparece buscando como A", async () => {
    const producto = await db.service.findFirst({ where: { id: B.serviceId, userId: A.id } });
    expect(producto).toBeNull();
  });

  it("la deuda de B no aparece buscando como A", async () => {
    const deuda = await db.debt.findFirst({ where: { id: B.debtId, userId: A.id } });
    expect(deuda).toBeNull();
  });

  it("A no puede editar el producto de B", async () => {
    const r = await db.service.updateMany({
      where: { id: B.serviceId, userId: A.id },
      data: { name: "Robado" },
    });
    expect(r.count).toBe(0);

    const intacto = await db.service.findUnique({ where: { id: B.serviceId } });
    expect(intacto?.name).toContain("de b");
  });

  it("A no puede borrar la venta de B", async () => {
    const r = await db.sale.deleteMany({ where: { id: B.saleId, userId: A.id } });
    expect(r.count).toBe(0);
    expect(await db.sale.findUnique({ where: { id: B.saleId } })).not.toBeNull();
  });
});

describe("el espacio de trabajo tampoco se cruza", () => {
  /** Arma el menu de la persona que manda en esa cuenta. */
  async function configurar(cuenta: Cuenta, escondidos: string) {
    const staff = await db.staff.findFirstOrThrow({
      where: { userId: cuenta.id },
      select: { id: true },
    });
    return db.workspaceConfig.upsert({
      where: { staffId: staff.id },
      create: { staffId: staff.id, userId: cuenta.id, hiddenKeys: escondidos, orderKeys: "" },
      update: { hiddenKeys: escondidos },
    });
  }

  it("A no ve la configuracion de menu de B", async () => {
    await configurar(A, "cartera");
    const deB = await configurar(B, "reportes,proveedores");

    const mias = await db.workspaceConfig.findMany({ where: { userId: A.id } });
    expect(mias.length).toBe(1);
    expect(mias[0].hiddenKeys).toBe("cartera");
    expect(mias.some((c) => c.id === deB.id)).toBe(false);
  });

  it("A no puede cambiarle el menu a B", async () => {
    const deB = await configurar(B, "reportes,proveedores");

    const r = await db.workspaceConfig.updateMany({
      where: { id: deB.id, userId: A.id },
      data: { hiddenKeys: "todo" },
    });
    expect(r.count).toBe(0);

    const intacta = await db.workspaceConfig.findUnique({ where: { id: deB.id } });
    expect(intacta?.hiddenKeys).toBe("reportes,proveedores");
  });

  it("cada configuracion pertenece al mismo dueno que su persona", async () => {
    const cruzadas = await db.$queryRaw<{ n: number }[]>`
      select count(*)::int as n
        from "WorkspaceConfig" w
        join "Staff" s on s.id = w."staffId"
       where w."userId" <> s."userId"`;
    expect(cruzadas[0].n).toBe(0);
  });

  it("el catalogo de modulos si es comun: no lleva dueno", async () => {
    // Module y BusinessTypeModule son la misma lista para todo el mundo. Vale
    // la pena dejarlo escrito: si algun dia alguien les mete datos de un
    // negocio, esta prueba deja de tener sentido y hay que replantearla.
    const cuantos = await db.module.count();
    expect(cuantos).toBeGreaterThan(0);

    const turnosEnRopa = await db.businessTypeModule.count({
      where: { businessType: "ROPA", moduleKey: "turnos" },
    });
    expect(turnosEnRopa).toBe(0);

    const turnosEnBarberia = await db.businessTypeModule.count({
      where: { businessType: "BARBERIA", moduleKey: "turnos" },
    });
    expect(turnosEnBarberia).toBe(1);
  });

  it("las visitas anotadas de A no traen las de B", async () => {
    await db.moduleEvent.create({ data: { userId: A.id, moduleKey: "ventas" } });
    const deB = await db.moduleEvent.create({ data: { userId: B.id, moduleKey: "ventas" } });

    const mias = await db.moduleEvent.findMany({ where: { userId: A.id } });
    expect(mias.length).toBeGreaterThan(0);
    expect(mias.some((e) => e.id === deB.id)).toBe(false);
  });
});

describe("borrar una cuenta se lleva lo suyo y nada mas", () => {
  it("al borrar una cuenta de prueba, la otra queda intacta", async () => {
    const temporal = await crearCuenta("temporal");
    await db.user.delete({ where: { id: temporal.id } });

    expect(await db.sale.findUnique({ where: { id: temporal.saleId } })).toBeNull();
    expect(await db.saleItem.findUnique({ where: { id: temporal.saleItemId } })).toBeNull();

    // La cuenta A no se toco.
    expect(await db.sale.findUnique({ where: { id: A.saleId } })).not.toBeNull();
  });
});
