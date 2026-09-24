import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { asignarLavador, cerrarLavado, crearWashJob, marcarListo } from "../src/lib/lavadero";
import { getStaffTotals } from "../src/lib/queries";
import { puedeHacer } from "../src/lib/permisos-empleado";
import { etiquetaDeRol } from "../src/lib/staff";

/**
 * El patio del lavadero: recibir un vehiculo, asignarlo a un lavador, cerrarlo
 * y que la comision y la tarjeta de fidelizacion queden bien.
 */
const db = new PrismaClient();
const S = "patio-" + Date.now();

let userId: string;
let jefeId: string;
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
      loyaltyGoal: 2,
      staff: {
        create: [
          { name: "Dueño", role: "DUENO" },
          { name: "Andrés (jefe de patio)", role: "SUPERVISOR" },
          { name: "Jhon (lavador)", role: "VENDEDOR", commissionPct: 20 },
        ],
      },
    },
    include: { staff: true },
  });
  userId = user.id;
  jefeId = user.staff.find((s) => s.role === "SUPERVISOR")!.id;
  lavadorId = user.staff.find((s) => s.role === "VENDEDOR")!.id;

  const service = await db.service.create({
    data: { userId, name: "Lavado completo", price: 20000, category: "Lavados" },
  });
  serviceId = service.id;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

describe("permisos del jefe de patio", () => {
  it("el jefe de patio puede borrar y cambiar ventas y vehículos; el lavador no", () => {
    expect(puedeHacer("SUPERVISOR", "deleteSaleAction")).toBe(true);
    expect(puedeHacer("SUPERVISOR", "updateSalePaymentAction")).toBe(true);
    expect(puedeHacer("SUPERVISOR", "deleteWashJobAction")).toBe(true);
    expect(puedeHacer("VENDEDOR", "deleteSaleAction")).toBe(false);
    expect(puedeHacer("VENDEDOR", "deleteWashJobAction")).toBe(false);
  });

  it("se llama Jefe de patio en el lavadero, y Supervisor en cualquier otro negocio", () => {
    expect(etiquetaDeRol("SUPERVISOR", "LAVADERO")).toBe("Jefe de patio");
    expect(etiquetaDeRol("SUPERVISOR", "OTRO")).toBe("Supervisor");
  });
});

describe("recibir, asignar y cobrar un vehículo", () => {
  it("crea el vehículo en cola, sin lavador", async () => {
    const job = await crearWashJob(userId, "2026-09-24", {
      clientName: "Carlos Pérez",
      clientPhone: "3001234567",
      vehiclePlate: "ABC-123",
      vehicleType: "carro",
      vehicleColor: "Rojo",
      serviceId,
      notes: null,
      receivedById: jefeId,
    });
    expect(job.status).toBe("EN_COLA");
    expect(job.assignedStaffId).toBeNull();
    expect(job.price).toBe(20000);
    expect(job.customerId).not.toBeNull();
  });

  it("asignarle lavador lo pasa a LAVANDO, y marcarListo a LISTO", async () => {
    const job = await crearWashJob(userId, "2026-09-24", {
      clientName: "Carlos Pérez",
      clientPhone: "3001234567",
      vehiclePlate: "ABC-123",
      vehicleType: "carro",
      vehicleColor: "Rojo",
      serviceId,
      notes: null,
      receivedById: jefeId,
    });

    const asignado = await asignarLavador(userId, job.id, lavadorId);
    expect(asignado?.status).toBe("LAVANDO");
    expect(asignado?.assignedStaffId).toBe(lavadorId);

    const listo = await marcarListo(userId, job.id);
    expect(listo?.status).toBe("LISTO");
  });

  it("cerrarLavado crea la venta a nombre del lavador y dispara el sello de fidelización", async () => {
    const job = await crearWashJob(userId, "2026-09-24", {
      clientName: "Carlos Pérez",
      clientPhone: "3001234567",
      vehiclePlate: "ABC-123",
      vehicleType: "carro",
      vehicleColor: "Rojo",
      serviceId,
      notes: null,
      receivedById: jefeId,
    });
    await asignarLavador(userId, job.id, lavadorId);
    await marcarListo(userId, job.id);

    const cierre = await cerrarLavado(userId, job.id, { paymentMethod: "EFECTIVO", amount: 20000 });
    expect(cierre).not.toBeNull();
    expect(cierre!.sello).not.toBeNull();
    expect(cierre!.sello!.stamps).toBe(1); // primer lavado cobrado de este cliente

    const venta = await db.sale.findUnique({ where: { id: cierre!.saleId } });
    expect(venta?.staffId).toBe(lavadorId);
    expect(venta?.origin).toBe("LAVADO");
    expect(venta?.washJobId).toBe(job.id);

    const actualizado = await db.washJob.findUnique({ where: { id: job.id } });
    expect(actualizado?.status).toBe("ENTREGADO");

    // La comisión del lavador ya cuenta esta venta, sin nada nuevo que calcular.
    const totales = await getStaffTotals(userId, "2026-09-24", "2026-09-24");
    const fila = totales.rows.find((r) => r.staffId === lavadorId);
    expect(fila?.totalSales).toBe(20000);
    expect(fila?.commission).toBe(4000); // 20% de 20.000
  });

  it("no se puede cerrar dos veces el mismo vehículo", async () => {
    const job = await crearWashJob(userId, "2026-09-24", {
      clientName: "Otro cliente",
      clientPhone: "3009999999",
      vehiclePlate: null,
      vehicleType: null,
      vehicleColor: null,
      serviceId,
      notes: null,
      receivedById: jefeId,
    });
    await asignarLavador(userId, job.id, lavadorId);
    const primero = await cerrarLavado(userId, job.id, { paymentMethod: "EFECTIVO", amount: 20000 });
    expect(primero).not.toBeNull();
    const segundo = await cerrarLavado(userId, job.id, { paymentMethod: "EFECTIVO", amount: 20000 });
    expect(segundo).toBeNull();
  });
});

describe("la tarjeta de fidelización se completa y se reinicia", () => {
  it("al llegar a la meta (2), vuelve a cero y suma un premio", async () => {
    // El cliente "Carlos Pérez" ya lleva 1 sello de la prueba de arriba.
    const job = await crearWashJob(userId, "2026-09-24", {
      clientName: "Carlos Pérez",
      clientPhone: "3001234567",
      vehiclePlate: "ABC-123",
      vehicleType: "carro",
      vehicleColor: "Rojo",
      serviceId,
      notes: null,
      receivedById: jefeId,
    });
    await asignarLavador(userId, job.id, lavadorId);
    const cierre = await cerrarLavado(userId, job.id, { paymentMethod: "EFECTIVO", amount: 20000 });

    expect(cierre!.sello!.alcanzoMeta).toBe(true);
    expect(cierre!.sello!.stamps).toBe(0);

    const tarjeta = await db.loyaltyCard.findUnique({ where: { customerId: job.customerId! } });
    expect(tarjeta?.stamps).toBe(0);
    expect(tarjeta?.rewardsEarned).toBe(1);
  });
});
