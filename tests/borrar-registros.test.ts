import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { asignarLavador, cerrarLavado, crearWashJob, marcarListo } from "../src/lib/lavadero";
import { borrarVehiculo, borrarVenta } from "../src/lib/borrar-registros";
import { avisoBorrarEntrega, avisoBorrarGasto, avisoBorrarVehiculo, avisoBorrarVenta } from "../src/lib/impacto-borrado";

/**
 * La dueña del lavadero borra ventas y vehículos, en cualquier estado, y los
 * números siguen cuadrando: el vehículo, la venta, la tarjeta de
 * fidelización y la factura quedan como dice el aviso que vio antes.
 */
const db = new PrismaClient();
const S = "borrar-" + Date.now();

let userId: string;
let otroId: string;
let lavadorId: string;
let serviceId: string;

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: "fer-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Fer",
      businessName: "Lavadero " + S,
      businessType: "LAVADERO",
      slug: "lav-" + S,
      loyaltyGoal: 2,
      staff: { create: [{ name: "Fer", role: "DUENO" }, { name: "Jhon", role: "VENDEDOR", commissionPct: 40 }] },
    },
    include: { staff: true },
  });
  userId = user.id;
  lavadorId = user.staff.find((s) => s.role === "VENDEDOR")!.id;
  serviceId = (await db.service.create({ data: { userId, name: "Lavado completo", price: 25000 } })).id;
  otroId = (
    await db.user.create({
      data: { email: "otro-" + S + "@test.local", passwordHash: "x", ownerName: "Otro", businessName: "Otro " + S, businessType: "LAVADERO", slug: "otro-" + S },
    })
  ).id;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

/** Un lavado recibido, lavado y cobrado, como en el patio. */
async function lavadoCobrado(cliente: string) {
  const job = await crearWashJob(userId, "2026-10-15", {
    clientName: cliente,
    clientPhone: "300" + cliente.length,
    vehiclePlate: "ABC-" + cliente.length,
    vehicleType: "carro",
    vehicleColor: null,
    serviceId,
    notes: null,
    receivedById: lavadorId,
  });
  await asignarLavador(userId, job.id, lavadorId);
  await marcarListo(userId, job.id);
  const cierre = await cerrarLavado(userId, job.id, { paymentMethod: "EFECTIVO", amount: 25000 });
  return { job, saleId: cierre!.saleId };
}

const tarjeta = async (customerId: string | null) => db.loyaltyCard.findUnique({ where: { customerId: customerId! } });

describe("borrar la venta de un lavado", () => {
  it("el vehículo vuelve a Pendientes y la tarjeta pierde el sello", async () => {
    const { job, saleId } = await lavadoCobrado("Carlos");
    expect((await tarjeta(job.customerId))?.stamps).toBe(1);

    const r = await borrarVenta(userId, saleId);
    expect(r).toMatchObject({ day: "2026-10-15", total: 25000 });
    expect(await db.sale.findUnique({ where: { id: saleId } })).toBeNull();
    const despues = await db.washJob.findUnique({ where: { id: job.id } });
    expect(despues).toMatchObject({ status: "POR_COBRAR", price: 25000 });
    expect((await tarjeta(job.customerId))?.stamps).toBe(0);
    expect(await db.loyaltyStamp.count({ where: { saleId } })).toBe(0);

    // Se puede volver a cobrar, y cae otra vez en la caja.
    expect(await cerrarLavado(userId, job.id, { paymentMethod: "TARJETA", amount: 25000, day: "2026-10-16" })).not.toBeNull();
  });

  it("si ese sello completó la meta, se deshace el premio", async () => {
    // Meta de 2: el segundo lavado completa la tarjeta (queda en 0 con un premio).
    await lavadoCobrado("Marta");
    const { job, saleId } = await lavadoCobrado("Marta");
    expect(await tarjeta(job.customerId)).toMatchObject({ stamps: 0, rewardsEarned: 1 });

    await borrarVenta(userId, saleId);
    expect(await tarjeta(job.customerId)).toMatchObject({ stamps: 1, rewardsEarned: 0 });
  });

  it("no borra la de otro negocio ni la que tiene factura autorizada", async () => {
    const { saleId } = await lavadoCobrado("Lucía");
    expect(await borrarVenta(otroId, saleId)).toBeNull();

    await db.electronicInvoice.create({
      data: { userId, saleId, country: "CO", environment: "pruebas", status: "AUTORIZADA", number: "SETP-1", customer: {}, subtotal: 25000, tax: 0, total: 25000 },
    });
    expect(await borrarVenta(userId, saleId)).toBeNull();
    expect(await db.sale.findUnique({ where: { id: saleId } })).not.toBeNull();
  });
});

describe("borrar un vehículo", () => {
  it("ya cobrado: se va con su venta y su sello", async () => {
    const { job, saleId } = await lavadoCobrado("Pedro Pablo");
    const r = await borrarVehiculo(userId, job.id);
    expect(r).toMatchObject({ clientName: "Pedro Pablo", ventaTotal: 25000 });
    expect(await db.washJob.findUnique({ where: { id: job.id } })).toBeNull();
    expect(await db.sale.findUnique({ where: { id: saleId } })).toBeNull();
    expect((await tarjeta(job.customerId))?.stamps).toBe(0);
  });

  it("sin cobrar, en cualquier estado: se borra solo el vehículo", async () => {
    const job = await crearWashJob(userId, "2026-10-15", {
      clientName: "En cola",
      clientPhone: "301",
      vehiclePlate: null,
      vehicleType: null,
      vehicleColor: null,
      serviceId: null,
      notes: null,
      receivedById: lavadorId,
    });
    const ventas = await db.sale.count({ where: { userId } });
    expect(await borrarVehiculo(userId, job.id)).toMatchObject({ ventaTotal: null });
    expect(await db.washJob.findUnique({ where: { id: job.id } })).toBeNull();
    expect(await db.sale.count({ where: { userId } })).toBe(ventas);
  });

  it("otro negocio no lo borra", async () => {
    const { job } = await lavadoCobrado("Ajeno");
    expect(await borrarVehiculo(otroId, job.id)).toBeNull();
    expect(await db.washJob.findUnique({ where: { id: job.id } })).not.toBeNull();
  });
});

describe("lo que dice el aviso antes de borrar", () => {
  it("la venta de un lavado: caja, comisión, vehículo, sello y recibo", () => {
    const a = avisoBorrarVenta(
      {
        day: "2026-10-15",
        total: 25000,
        paymentMethod: "EFECTIVO",
        origin: "LAVADO",
        clientName: "Carlos",
        receiptSeq: 12,
        items: [{ name: "Lavado completo", qty: 1, variantId: null }],
        staff: { name: "Jhon", commissionPct: 40 },
        washJob: { vehiclePlate: "ABC-123", vehicleType: "carro", vehicleColor: null },
        conSello: true,
        conFacturaFallida: false,
      },
      { currency: "COP", cajaCerrada: true }
    );
    const texto = [...a.que, ...a.efectos].join("\n");
    expect(texto).toContain("Recibo #0012");
    expect(texto).toMatch(/caja del 15 de octubre \(efectivo baja \$\s?25\.000\)/);
    expect(texto).toMatch(/Jhon.*deja de ganar \$\s?10\.000 de comisión/);
    expect(texto).toContain("ABC-123 vuelve a Pendientes");
    expect(texto).toContain("pierde el sello");
    expect(texto).toContain("ya está cerrada");
  });

  it("un vehículo cobrado avisa que se va su venta; uno en cola, que la caja no cambia", () => {
    const base = {
      day: "2026-10-15",
      clientName: "Carlos",
      vehiclePlate: "ABC-123",
      vehicleType: "carro",
      vehicleColor: null,
      serviceName: "Lavado completo",
      price: 25000,
      lavador: { name: "Jhon", commissionPct: 40 },
      appointment: false,
    };
    const cobrado = avisoBorrarVehiculo(
      { ...base, status: "ENTREGADO", sale: { total: 25000, paymentMethod: "EFECTIVO", day: "2026-10-15", receiptSeq: 3, conSello: false } },
      { currency: "COP", cajaCerrada: false }
    );
    expect(cobrado.efectos.join("\n")).toContain("Se borra también su venta");
    expect(cobrado.efectos.join("\n")).toMatch(/deja de ganar \$\s?10\.000/);

    const enCola = avisoBorrarVehiculo({ ...base, status: "EN_COLA", sale: null }, { currency: "COP", cajaCerrada: false });
    expect(enCola.efectos.join("\n")).toContain("la caja y las ventas no cambian");

    const debe = avisoBorrarVehiculo({ ...base, status: "POR_COBRAR", sale: null }, { currency: "COP", cajaCerrada: false });
    expect(debe.efectos.join("\n")).toMatch(/Carlos debía \(\$\s?25\.000\)/);
  });

  it("gastos y entregas de turno", () => {
    const g = avisoBorrarGasto({ day: "2026-10-15", description: "Shampoo", category: "Insumos", amount: 60000 }, { currency: "COP", cajaCerrada: false });
    expect(g.efectos[0]).toMatch(/el neto de la caja de ese día sube \$\s?60\.000/);
    const e = avisoBorrarEntrega(
      { day: "2026-10-15", de: "Andrés", para: "Camila", totalSales: 100000, cashDelivered: 50000, pendingCount: 1, recibida: false, esLaUltima: true },
      { currency: "COP" }
    );
    expect(e.efectos.join("\n")).toContain("no cambian");
    expect(e.efectos.join("\n")).toContain("vuelve a contar desde la entrega anterior");
    expect(e.efectos.join("\n")).toContain("Camila deja de ver el aviso");
  });
});
