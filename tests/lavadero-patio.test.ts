import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { asignarLavador, cerrarLavado, crearWashJob, marcarListo } from "../src/lib/lavadero";
import { getStaffTotals } from "../src/lib/queries";
import { puedeAsignarleCarro, puedeHacer } from "../src/lib/permisos-empleado";
import { etiquetaDeRol } from "../src/lib/staff";

/**
 * El patio del lavadero: recibir un vehiculo, asignarlo a un lavador, cerrarlo
 * y que la comision y la tarjeta de fidelizacion queden bien.
 */
const db = new PrismaClient();
const S = "patio-" + Date.now();

let userId: string;
let dueñoId: string;
let jefeId: string;
let andreaId: string;
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
          { name: "Andrea (jefe de patio que lava)", role: "SUPERVISOR", commissionPct: 30 },
          { name: "Jhon (lavador)", role: "VENDEDOR", commissionPct: 20 },
        ],
      },
    },
    include: { staff: true },
  });
  userId = user.id;
  dueñoId = user.staff.find((s) => s.role === "DUENO")!.id;
  jefeId = user.staff.find((s) => s.name.startsWith("Andrés"))!.id;
  andreaId = user.staff.find((s) => s.name.startsWith("Andrea"))!.id;
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
  it("el jefe de patio cambia ventas, vehículos y precios, pero no borra; el lavador ninguna", () => {
    // La forma de pago de una venta ya registrada la cambia solo la dueña (ver ACCIONES_SUPERVISOR).
    expect(puedeHacer("SUPERVISOR", "updateSalePaymentAction")).toBe(false);
    expect(puedeHacer("SUPERVISOR", "updateWashJobAction")).toBe(true);
    expect(puedeHacer("SUPERVISOR", "cambiarPrecioLavadoAction")).toBe(true);
    expect(puedeHacer("SUPERVISOR", "deleteSaleAction")).toBe(false);
    expect(puedeHacer("SUPERVISOR", "deleteWashJobAction")).toBe(false);
    expect(puedeHacer("VENDEDOR", "deleteSaleAction")).toBe(false);
    expect(puedeHacer("VENDEDOR", "deleteWashJobAction")).toBe(false);
    expect(puedeHacer("VENDEDOR", "cambiarPrecioLavadoAction")).toBe(false);
    expect(puedeHacer("DUENO", "deleteSaleAction")).toBe(true);
    expect(puedeHacer("DUENO", "cambiarPrecioLavadoAction")).toBe(true);
  });

  it("al jefe de patio le asigna carros otro jefe de patio o el dueño, nunca él mismo", () => {
    const dueño = { id: "d", role: "DUENO" };
    const andres = { id: "a", role: "SUPERVISOR" };
    const andrea = { id: "b", role: "SUPERVISOR" };
    const jhon = { id: "j", role: "VENDEDOR" };

    expect(puedeAsignarleCarro(dueño, andrea)).toBe(true);
    expect(puedeAsignarleCarro(andres, andrea)).toBe(true);
    expect(puedeAsignarleCarro(andrea, andrea)).toBe(false);
    // Al lavador sí se los sigue asignando cualquiera de los dos.
    expect(puedeAsignarleCarro(andrea, jhon)).toBe(true);
    expect(puedeAsignarleCarro(dueño, jhon)).toBe(true);
    // El lavador no asigna, y al dueño no se le asignan carros.
    expect(puedeAsignarleCarro(jhon, andrea)).toBe(false);
    expect(puedeAsignarleCarro(andres, dueño)).toBe(false);
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

describe("un jefe de patio que también lava", () => {
  it("el carro que le asignó otro jefe de patio queda a su nombre, con su comisión", async () => {
    // Otro día y otro cliente: no se mezcla con las cuentas de Jhon ni con los sellos de Carlos.
    const job = await crearWashJob(userId, "2026-09-25", {
      clientName: "Cliente de Andrea",
      clientPhone: "3005550000",
      vehiclePlate: "XYZ-987",
      vehicleType: "camioneta",
      vehicleColor: null,
      serviceId,
      notes: null,
      receivedById: jefeId,
    });
    expect(puedeAsignarleCarro({ id: jefeId, role: "SUPERVISOR" }, { id: andreaId, role: "SUPERVISOR" })).toBe(true);
    expect(puedeAsignarleCarro({ id: dueñoId, role: "DUENO" }, { id: andreaId, role: "SUPERVISOR" })).toBe(true);
    await asignarLavador(userId, job.id, andreaId);
    await marcarListo(userId, job.id);

    const cierre = await cerrarLavado(userId, job.id, { paymentMethod: "EFECTIVO", amount: 20000 });
    const venta = await db.sale.findUnique({ where: { id: cierre!.saleId } });
    expect(venta?.staffId).toBe(andreaId);

    const totales = await getStaffTotals(userId, "2026-09-25", "2026-09-25");
    const fila = totales.rows.find((r) => r.staffId === andreaId);
    expect(fila?.totalSales).toBe(20000);
    expect(fila?.commission).toBe(6000); // 30% de 20.000
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

describe("un vehículo recibido sin señal", () => {
  it("queda con la llave que le puso el teléfono, y lo que sigue le cae al mismo", async () => {
    const llave = "sin-senal-" + S;
    const job = await crearWashJob(userId, "2026-09-23", {
      id: llave,
      clientName: "Ana Sin Señal",
      clientPhone: "3009990000",
      vehiclePlate: null,
      vehicleType: "moto",
      vehicleColor: null,
      serviceId,
      notes: null,
      receivedById: jefeId,
    });
    expect(job.id).toBe(llave);
    expect(job.day).toBe("2026-09-23");

    // Asignar, terminar y cobrar con la misma llave, como llegan de la cola.
    expect((await asignarLavador(userId, llave, lavadorId))?.status).toBe("LAVANDO");
    expect((await marcarListo(userId, llave))?.status).toBe("LISTO");
    const cierre = await cerrarLavado(userId, llave, { paymentMethod: "EFECTIVO", amount: 20000, day: "2026-09-24" });
    const venta = await db.sale.findUnique({ where: { id: cierre!.saleId } });
    // La venta cae el día del lavado, no el día en que se subió.
    expect(venta?.day).toBe("2026-09-23");

    // La misma llave no crea otro vehículo.
    await expect(
      crearWashJob(userId, "2026-09-23", {
        id: llave,
        clientName: "Ana Sin Señal",
        clientPhone: "3009990000",
        vehiclePlate: null,
        vehicleType: null,
        vehicleColor: null,
        serviceId: null,
        notes: null,
        receivedById: jefeId,
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("una llave rara no se usa: el servidor pone la suya", async () => {
    const job = await crearWashJob(userId, "2026-09-23", {
      id: "x'; drop",
      clientName: "Otra",
      clientPhone: "3009990001",
      vehiclePlate: null,
      vehicleType: null,
      vehicleColor: null,
      serviceId: null,
      notes: null,
      receivedById: jefeId,
    });
    expect(job.id).not.toBe("x'; drop");
  });
});
