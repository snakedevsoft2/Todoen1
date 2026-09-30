import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  anularTicket,
  asegurarTarifas,
  cobroAhora,
  ingresarVehiculo,
  registrarSalida,
  resumenParqueadero,
  validarTarifa,
} from "../src/lib/parqueadero";
import {
  cobroDe,
  duracionTexto,
  minutosEntre,
  normalizarPlaca,
  rangoTexto,
  tarifaEnPalabras,
  type Tarifa,
} from "../src/lib/parqueadero-tarifa";
import { ticketMensaje, ticketTirilla, type TicketData } from "../src/lib/ticket-parqueadero";
import { tirillaHtml } from "../src/lib/tirilla";
import { tirillaEscPos } from "../src/lib/escpos";
import { qrModulos } from "../src/lib/qr";
import { puedeHacer } from "../src/lib/permisos-empleado";
import { PRESETS, TIPOS_ABIERTOS } from "../prisma/modulos";
import { TIPOS_ELEGIBLES } from "../src/lib/tipo-negocio";

/**
 * El parqueadero: cuanto se cobra por el tiempo, y el camino completo de un
 * vehiculo (entra, sale pagando o debiendo) contra la base de verdad.
 */

const CARRO: Tarifa = { pricePerHour: 3000, fractionMinutes: 60, graceMinutes: 0, pricePerDay: 20000 };

describe("cobro por tiempo", () => {
  it("cobra cada hora empezada", () => {
    expect(cobroDe(CARRO, 0)).toBe(0);
    expect(cobroDe(CARRO, 1)).toBe(3000);
    expect(cobroDe(CARRO, 60)).toBe(3000);
    expect(cobroDe(CARRO, 61)).toBe(6000);
    expect(cobroDe(CARRO, 180)).toBe(9000);
  });

  it("no pasa del tope del día, y cada día completo vale el día", () => {
    expect(cobroDe(CARRO, 8 * 60)).toBe(20000); // 8 h serian 24.000
    expect(cobroDe(CARRO, 24 * 60)).toBe(20000);
    expect(cobroDe(CARRO, 24 * 60 + 30)).toBe(23000);
    expect(cobroDe(CARRO, 48 * 60)).toBe(40000);
  });

  it("por fracción y con minutos gratis", () => {
    const t: Tarifa = { pricePerHour: 3000, fractionMinutes: 15, graceMinutes: 10, pricePerDay: 0 };
    expect(cobroDe(t, 10)).toBe(0);
    expect(cobroDe(t, 11)).toBe(750);
    expect(cobroDe(t, 46)).toBe(3000);
    expect(cobroDe(t, 10 * 60)).toBe(30000); // sin tope
  });

  it("solo por día cobra cada día empezado", () => {
    const t: Tarifa = { pricePerHour: 0, fractionMinutes: 60, graceMinutes: 0, pricePerDay: 15000 };
    expect(cobroDe(t, 5)).toBe(15000);
    expect(cobroDe(t, 24 * 60)).toBe(15000);
    expect(cobroDe(t, 24 * 60 + 1)).toBe(30000);
  });

  it("cuenta el minuto empezado", () => {
    const desde = new Date("2026-09-30T10:00:00Z");
    expect(minutosEntre(desde, new Date("2026-09-30T10:00:10Z"))).toBe(1);
    expect(minutosEntre(desde, new Date("2026-09-30T11:00:00Z"))).toBe(60);
    expect(minutosEntre(desde, desde)).toBe(0);
  });

  it("le explica la tarifa y el rango al cliente", () => {
    expect(rangoTexto(CARRO, "COP")).toMatch(/Desde .*3\.000 hasta .*20\.000 por día/);
    expect(tarifaEnPalabras(CARRO, "COP").join(" ")).toMatch(/Hora: .*3\.000.*Día completo \(tope\)/);
    expect(duracionTexto(135)).toBe("2 h 15 min");
    expect(duracionTexto(1500)).toBe("1 día 1 h");
  });

  it("normaliza la placa", () => {
    expect(normalizarPlaca(" abc-123 ")).toBe("ABC123");
    expect(normalizarPlaca("xyz 12d")).toBe("XYZ12D");
  });

  it("no deja una tarifa sin precio ni un día más barato que la hora", () => {
    expect(validarTarifa({ name: "Moto", pricePerHour: 0, fractionMinutes: 60, graceMinutes: 0, pricePerDay: 0 })).toBeTruthy();
    expect(validarTarifa({ name: "Moto", pricePerHour: 2000, fractionMinutes: 60, graceMinutes: 0, pricePerDay: 1000 })).toBeTruthy();
    expect(validarTarifa({ name: "Moto", pricePerHour: 2000, fractionMinutes: 60, graceMinutes: 0, pricePerDay: 0 })).toBeNull();
  });
});

describe("ticket impreso", () => {
  const url = "https://ejemplo.test/ticket/abc123";
  const data: TicketData = {
    businessName: "Parqueadero Centro",
    address: "Calle 10 # 5-20",
    phone: "3001234567",
    logoUrl: null,
    seq: 7,
    plate: "ABC123",
    vehicleType: "Carro",
    spot: "Puesto 4",
    enteredAt: "2026-09-30T15:00:00.000Z",
    timezone: "America/Bogota",
    currency: "COP",
    tarifa: CARRO,
    url,
    qrModulos: qrModulos(url),
    salida: null,
  };

  it("lleva el QR que apunta a la página del ticket", () => {
    const lineas = ticketTirilla(data);
    const qr = lineas.find((l) => l.t === "qr");
    expect(qr && qr.t === "qr" && qr.text).toBe(url);
    const html = tirillaHtml(lineas, "58");
    expect(html).toContain('class="ti-qr"');
    expect(html).toContain("<svg");
    expect(html).toContain("0007");
    // La termica directa recibe el comando de QR (GS ( k) con el enlace adentro.
    const bytes = Array.from(tirillaEscPos(lineas, 58));
    const gsk = bytes.findIndex((b, i) => b === 0x1d && bytes[i + 1] === 0x28 && bytes[i + 2] === 0x6b);
    expect(gsk).toBeGreaterThan(-1);
    expect(Buffer.from(Uint8Array.from(bytes)).toString("latin1")).toContain(url);
  });

  it("el mensaje de WhatsApp lleva el enlace, la tarifa y la dirección", () => {
    const m = ticketMensaje(data);
    expect(m).toContain(url);
    expect(m).toContain("ABC123");
    expect(m).toContain("Calle 10");
    expect(m).toMatch(/Desde .* por día/);
  });
});

describe("el parqueadero en el catálogo", () => {
  it("se puede elegir al registrarse y trae su apartado", () => {
    expect(TIPOS_ELEGIBLES).toContain("PARQUEADERO");
    expect(TIPOS_ABIERTOS).toContain("PARQUEADERO");
    expect(PRESETS.PARQUEADERO.parqueadero).toBeDefined();
    expect(PRESETS.PARQUEADERO.catalogo).toBeUndefined();
  });

  it("anular es solo del dueño", () => {
    expect(puedeHacer("DUENO", "anularTicketAction")).toBe(true);
    expect(puedeHacer("VENDEDOR", "anularTicketAction")).toBe(false);
  });
});

const db = new PrismaClient();
const S = "parq-" + Date.now();
let userId: string;
let otroId: string;
let empleadoId: string;
let carroId: string;
let motoId: string;

async function negocio(nombre: string) {
  return db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Dueño",
      businessName: "Parqueadero " + nombre,
      businessType: "PARQUEADERO",
      slug: nombre + "-" + S,
      staff: { create: [{ name: "Dueño", role: "DUENO" }, { name: "Portero", role: "VENDEDOR" }] },
    },
    include: { staff: true },
  });
}

beforeAll(async () => {
  const u = await negocio("a");
  userId = u.id;
  empleadoId = u.staff.find((s) => s.role === "VENDEDOR")!.id;
  otroId = (await negocio("b")).id;
  await asegurarTarifas(userId);
  await asegurarTarifas(otroId);
  const rates = await db.parkingRate.findMany({ where: { userId } });
  carroId = rates.find((r) => r.name === "Carro")!.id;
  motoId = rates.find((r) => r.name === "Moto")!.id;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [userId, otroId] } } });
  await db.$disconnect();
});

describe("un vehículo de entrada a salida", () => {
  it("deja las tarifas de ejemplo una sola vez", async () => {
    await asegurarTarifas(userId);
    expect(await db.parkingRate.count({ where: { userId } })).toBe(2);
  });

  it("ingresa con la placa, numera el ticket y copia la tarifa", async () => {
    const r = await ingresarVehiculo(userId, "2026-09-30", { plate: "abc-123", rateId: carroId, receivedById: empleadoId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ticket.plate).toBe("ABC123");
    expect(r.ticket.seq).toBe(1);
    expect(r.ticket.pricePerHour).toBe(3000);
    expect(r.ticket.qrToken.length).toBeGreaterThan(15);

    const otra = await ingresarVehiculo(userId, "2026-09-30", { plate: "MOT12A", rateId: motoId });
    expect(otra.ok && otra.ticket.seq).toBe(2);
    expect(otra.ok && otra.ticket.qrToken).not.toBe(r.ticket.qrToken);
  });

  it("no deja la misma placa adentro dos veces", async () => {
    const r = await ingresarVehiculo(userId, "2026-09-30", { plate: "ABC 123", rateId: carroId });
    expect(r.ok).toBe(false);
  });

  it("no usa la tarifa de otro negocio", async () => {
    const r = await ingresarVehiculo(otroId, "2026-09-30", { plate: "ZZZ999", rateId: carroId });
    expect(r.ok).toBe(false);
  });

  it("cambiar la tarifa no le cambia el precio al que ya está adentro", async () => {
    await db.parkingRate.update({ where: { id: carroId }, data: { pricePerHour: 5000 } });
    const t = await db.parkingTicket.findFirstOrThrow({ where: { userId, plate: "ABC123" } });
    expect(t.pricePerHour).toBe(3000);
    await db.parkingRate.update({ where: { id: carroId }, data: { pricePerHour: 3000 } });
  });

  it("al salir pagando cobra por el tiempo y crea la venta", async () => {
    const t = await db.parkingTicket.findFirstOrThrow({ where: { userId, plate: "ABC123" } });
    const ahora = new Date(t.enteredAt.getTime() + (2 * 60 + 10) * 60000); // 2 h 10 min
    expect(cobroAhora(t, ahora)).toBe(9000);

    // Otro negocio no puede cobrarlo.
    const ajeno = await registrarSalida(otroId, t.id, { paymentMethod: "EFECTIVO", day: "2026-09-30", ahora });
    expect(ajeno.ok).toBe(false);

    const r = await registrarSalida(userId, t.id, { paymentMethod: "EFECTIVO", day: "2026-09-30", ahora, staffId: empleadoId });
    expect(r).toMatchObject({ ok: true, amount: 9000, pendiente: false });

    const venta = await db.sale.findFirstOrThrow({ where: { parkingTicketId: t.id }, include: { items: true } });
    expect(venta.origin).toBe("PARQUEADERO");
    expect(venta.total).toBe(9000);
    expect(venta.items[0].name).toContain("ABC123");

    // Cobrarlo otra vez no crea otra venta.
    const dos = await registrarSalida(userId, t.id, { paymentMethod: "EFECTIVO", day: "2026-09-30", ahora });
    expect(dos.ok).toBe(false);
    expect(await db.sale.count({ where: { parkingTicketId: t.id } })).toBe(1);
  });

  it("sale sin pagar, queda debiendo y paga otro día", async () => {
    const t = await db.parkingTicket.findFirstOrThrow({ where: { userId, plate: "MOT12A" } });
    const ahora = new Date(t.enteredAt.getTime() + 30 * 60000);
    const r = await registrarSalida(userId, t.id, { paymentMethod: "PENDIENTE", day: "2026-09-30", ahora });
    expect(r).toMatchObject({ ok: true, amount: 1500, pendiente: true });
    expect(await db.sale.count({ where: { parkingTicketId: t.id } })).toBe(0);

    const resumen = await resumenParqueadero(userId, "2026-09-30", "America/Bogota");
    expect(resumen.porCobrar).toBe(1);
    expect(resumen.porCobrarValor).toBe(1500);

    // Paga dos dias despues: la cuenta no sigue subiendo y la venta cae ese dia.
    const pago = await registrarSalida(userId, t.id, {
      paymentMethod: "TRANSFERENCIA",
      day: "2026-10-02",
      ahora: new Date(ahora.getTime() + 2 * 86400000),
    });
    expect(pago).toMatchObject({ ok: true, amount: 1500 });
    const venta = await db.sale.findFirstOrThrow({ where: { parkingTicketId: t.id } });
    expect(venta.day).toBe("2026-10-02");
  });

  it("anula el que se ingresó por error, y el pagado ya no se anula", async () => {
    const r = await ingresarVehiculo(userId, "2026-09-30", { plate: "ERR001", rateId: carroId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await anularTicket(otroId, r.ticket.id)).toBe(false);
    expect(await anularTicket(userId, r.ticket.id)).toBe(true);
    const pagado = await db.parkingTicket.findFirstOrThrow({ where: { userId, plate: "ABC123" } });
    expect(await anularTicket(userId, pagado.id)).toBe(false);
  });

  it("el resumen cuenta entradas, salidas y lo recaudado sin mezclar negocios", async () => {
    await ingresarVehiculo(otroId, "2026-09-30", {
      plate: "OTR111",
      rateId: (await db.parkingRate.findFirstOrThrow({ where: { userId: otroId } })).id,
    });
    const r = await resumenParqueadero(userId, "2026-09-30", "America/Bogota");
    expect(r.entraronHoy).toBe(2); // el anulado no cuenta
    expect(r.adentro).toBe(0);
    expect(r.porCobrar).toBe(0);
    expect(r.recaudadoHoy).toBe(9000);
    const otro = await resumenParqueadero(otroId, "2026-09-30", "America/Bogota");
    expect(otro.adentro).toBe(1);
    expect(otro.recaudadoHoy).toBe(0);
  });
});
