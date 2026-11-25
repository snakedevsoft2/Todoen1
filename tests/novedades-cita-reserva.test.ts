import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * MB Nails: cada cita que separan en línea le llega a la dueña al celular.
 * Otra barbería sigue sin ese aviso. El envío real (web-push) se reemplaza.
 */
const avisarAlDueno = vi.hoisted(() => vi.fn(async () => 1));
vi.mock("../src/lib/push", () => ({ avisarAlDueno }));

const { reservarTurno } = await import("../src/lib/reservas");
const { addDays, todayIn } = await import("../src/lib/dates");

const db = new PrismaClient();
const S = "novedades-" + Date.now();

async function negocio(nombre: string) {
  return db.user.create({
    data: {
      email: nombre.replace(/\W/g, "") + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Marcela",
      businessName: nombre,
      businessType: "BARBERIA",
      slug: nombre.replace(/\W/g, "").toLowerCase() + "-" + S,
      workDays: "1,2,3,4,5,6,7",
      openHour: 8,
      closeHour: 12,
      slotMinutes: 60,
      notifyOnBooking: false,
      staff: { create: [{ name: "Marcela", role: "DUENO", bookable: false }, { name: "Jessica", role: "BARBERO", bookable: true }] },
    },
  });
}

let mb: Awaited<ReturnType<typeof negocio>>;
let otra: Awaited<ReturnType<typeof negocio>>;

beforeAll(async () => {
  mb = await negocio("MB NAILS SPA");
  otra = await negocio("Barbería " + S);
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [mb.id, otra.id] } } });
  await db.$disconnect();
});

describe("cita nueva desde la reserva en línea", () => {
  const manana = addDays(todayIn(), 1);
  const datos = { day: manana, startTime: "09:00", clientName: "Ana", clientPhone: "3001234567", wantsReminder: false };

  it("en MB Nails le avisa a la dueña con la clienta, la hora y la manicurista", async () => {
    const r = await reservarTurno(mb, datos, "reserva");
    expect(r.ok).toBe(true);
    expect(avisarAlDueno).toHaveBeenCalledTimes(1);
    expect(avisarAlDueno).toHaveBeenCalledWith(mb.id, {
      title: "Cita nueva: Ana",
      body: "mañana 9:00 am · Servicio por definir · con Jessica",
      url: "/panel/turnos?d=" + manana,
    });
  });

  it("otra barbería no recibe ese aviso", async () => {
    avisarAlDueno.mockClear();
    const r = await reservarTurno(otra, datos, "reserva");
    expect(r.ok).toBe(true);
    expect(avisarAlDueno).not.toHaveBeenCalled();
  });
});
