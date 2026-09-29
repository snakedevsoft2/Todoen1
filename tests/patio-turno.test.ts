import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { asignarLavador, cerrarLavado, crearWashJob, marcarListo } from "../src/lib/lavadero";
import {
  entregaPorRecibir,
  entregarTurno,
  inicioDelTurno,
  recibirEntrega,
  repartir,
  repartoDelDia,
  resumenDelTurno,
  vehiculosPendientes,
} from "../src/lib/patio-turno";

/**
 * La jornada del lavadero: carros pendientes que pasan de un dia a otro, la
 * plata partida entre el lavadero y los lavadores, y la entrega de turno de un
 * jefe de patio al siguiente.
 */
const db = new PrismaClient();
const S = "turno-" + Date.now();
const AYER = "2026-09-27";
const HOY = "2026-09-28";

let userId: string;
let otroUserId: string;
let jefeA: string;
let jefeB: string;
let lavadorId: string;
let serviceId: string;

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: "lavadero-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Dueño",
      businessName: "Lavadero " + S,
      businessType: "LAVADERO",
      slug: "lavadero-" + S,
      staff: {
        create: [
          { name: "Dueño", role: "DUENO" },
          { name: "Andrés", role: "SUPERVISOR" },
          { name: "Camila", role: "SUPERVISOR" },
          { name: "Jhon", role: "VENDEDOR", commissionPct: 40 },
        ],
      },
    },
    include: { staff: true },
  });
  userId = user.id;
  jefeA = user.staff.find((s) => s.name === "Andrés")!.id;
  jefeB = user.staff.find((s) => s.name === "Camila")!.id;
  lavadorId = user.staff.find((s) => s.role === "VENDEDOR")!.id;
  serviceId = (await db.service.create({ data: { userId, name: "Lavado", price: 20000, category: "Lavados" } })).id;

  const otro = await db.user.create({
    data: {
      email: "otro-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Otro",
      businessName: "Otro " + S,
      businessType: "LAVADERO",
      slug: "otro-" + S,
    },
  });
  otroUserId = otro.id;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

describe("repartir", () => {
  it("solo los lavados dan comisión, y al lavador que lo lavó", () => {
    const r = repartir([
      { total: 20000, origin: "LAVADO", staffId: "a", staff: { commissionPct: 40 } },
      { total: 10000, origin: "LAVADO", staffId: "a", staff: { commissionPct: 40 } },
      { total: 5000, origin: "MANUAL", staffId: "a", staff: { commissionPct: 40 } },
      { total: 15000, origin: "LAVADO", staffId: null, staff: null },
    ]);
    expect(r.total).toBe(50000);
    expect(r.lavadores).toBe(12000);
    expect(r.lavadero).toBe(38000);
    expect(r.porLavador.get("a")).toEqual({ count: 2, total: 30000, comision: 12000 });
  });
});

describe("carros pendientes y entrega de turno", () => {
  it("un carro de ayer sin entregar sigue pendiente hoy", async () => {
    await crearWashJob(userId, AYER, {
      clientName: "Ayer",
      clientPhone: "300",
      vehiclePlate: "AYE-001",
      vehicleType: "carro",
      vehicleColor: null,
      serviceId,
      notes: null,
      receivedById: jefeA,
    });
    const pendientes = await vehiculosPendientes(userId);
    expect(pendientes.map((p) => p.vehiclePlate)).toEqual(["AYE-001"]);
    expect(pendientes[0].day).toBe(AYER);
    // Aislamiento: el otro negocio no ve este carro.
    expect(await vehiculosPendientes(otroUserId)).toHaveLength(0);
  });

  it("parte lo cobrado hoy entre el lavadero y el lavador", async () => {
    const job = await crearWashJob(userId, HOY, {
      clientName: "Hoy",
      clientPhone: "301",
      vehiclePlate: "HOY-002",
      vehicleType: "carro",
      vehicleColor: null,
      serviceId,
      notes: null,
      receivedById: jefeA,
    });
    await asignarLavador(userId, job.id, lavadorId);
    await marcarListo(userId, job.id);
    await cerrarLavado(userId, job.id, { paymentMethod: "EFECTIVO", amount: 20000 });

    const r = await repartoDelDia(userId, HOY);
    expect(r.total).toBe(20000);
    expect(r.lavadores).toBe(8000);
    expect(r.lavadero).toBe(12000);
  });

  it("el jefe A entrega su turno con el pendiente y lo cobrado; B lo recibe", async () => {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const resumen = await resumenDelTurno(userId, since);
    expect(resumen.vehiclesDelivered).toBe(1);
    expect(resumen.byMethod.EFECTIVO).toBe(20000);

    const entrega = await entregarTurno(userId, {
      day: HOY,
      since,
      fromStaffId: jefeA,
      toStaffId: jefeB,
      cashDelivered: 20000,
      notes: "El de ayer lo recogen mañana",
    });
    expect(entrega.pendingCount).toBe(1);
    expect(entrega.pendingValue).toBe(20000);
    expect(entrega.totalSales).toBe(20000);
    expect(entrega.totalCommissions).toBe(8000);

    // El pendiente no se movió: sigue en el patio para B.
    expect(await vehiculosPendientes(userId)).toHaveLength(1);

    // A no se puede recibir a sí mismo; B sí la ve y la recibe.
    expect(await entregaPorRecibir(userId, jefeA)).toBeNull();
    expect((await recibirEntrega(userId, entrega.id, jefeA)).count).toBe(0);
    expect((await entregaPorRecibir(userId, jefeB))?.id).toBe(entrega.id);
    // Desde otro negocio no se puede recibir.
    expect((await recibirEntrega(otroUserId, entrega.id, jefeB)).count).toBe(0);
    expect((await recibirEntrega(userId, entrega.id, jefeB)).count).toBe(1);
    expect(await entregaPorRecibir(userId, jefeB)).toBeNull();
  });

  it("el turno siguiente arranca en la última entrega", async () => {
    const ultima = await db.patioHandover.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    const inicio = await inicioDelTurno(userId, HOY, "America/Bogota");
    expect(inicio.getTime()).toBe(ultima!.createdAt.getTime());
  });
});
