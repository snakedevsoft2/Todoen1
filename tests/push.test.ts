import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Notificaciones push: al dueño todo su negocio (ventas y marcajes), a cada
 * empleado solo lo suyo. Nunca a otro negocio. web-push se reemplaza: aqui no
 * se manda nada de verdad, se mira a quien se le habria mandado.
 */
const enviados: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
const muertos = new Set<string>();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      if (muertos.has(sub.endpoint)) throw Object.assign(new Error("gone"), { statusCode: 410 });
      enviados.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    },
  },
}));

process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "publica";
process.env.VAPID_PRIVATE_KEY = "privada";

const { avisarAPersona, avisarMarcaje, avisarVentaGuardada } = await import("../src/lib/push");
const { recordarMarcar } = await import("../src/lib/recordar-marcar");

const db = new PrismaClient();
const S = "push-" + Date.now();
const AHORA = new Date("2026-09-29T13:00:00Z"); // 8:00 a. m. en Bogota

let userId: string;
let otroId: string;
let dueno: string;
let jefe: string;
let lavador: string;
let ventaId: string;

async function suscribir(uid: string, staffId: string, nombre: string) {
  await db.pushSubscription.create({
    data: { userId: uid, staffId, endpoint: "https://push.test/" + nombre + "-" + S, p256dh: "k", auth: "a" },
  });
}
const a = (nombre: string) => "https://push.test/" + nombre + "-" + S;

beforeAll(async () => {
  const u = await db.user.create({
    data: {
      email: "lav-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Dueño",
      businessName: "Lav " + S,
      businessType: "LAVADERO",
      slug: "lav-" + S,
      staff: {
        create: [
          { name: "Dueño", role: "DUENO" },
          { name: "Andrés Gómez", role: "SUPERVISOR" },
          { name: "Jhon", role: "VENDEDOR" },
        ],
      },
    },
    include: { staff: true },
  });
  userId = u.id;
  dueno = u.staff.find((s) => s.role === "DUENO")!.id;
  jefe = u.staff.find((s) => s.role === "SUPERVISOR")!.id;
  lavador = u.staff.find((s) => s.role === "VENDEDOR")!.id;

  const o = await db.user.create({
    data: {
      email: "otro-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Otro",
      businessName: "Otro " + S,
      businessType: "LAVADERO",
      slug: "otro-" + S,
      staff: { create: [{ name: "Otro dueño", role: "DUENO" }] },
    },
    include: { staff: true },
  });
  otroId = o.id;

  await suscribir(userId, dueno, "dueno");
  await suscribir(userId, jefe, "jefe");
  await suscribir(userId, lavador, "lavador");
  await suscribir(otroId, o.staff[0].id, "otro");

  ventaId = (
    await db.sale.create({
      data: {
        userId,
        day: "2026-09-29",
        total: 20000,
        paymentMethod: "TRANSFERENCIA",
        clientName: "Carlos",
        staffId: lavador,
        items: { create: [{ userId, name: "Lavado", unitPrice: 20000, qty: 1 }] },
      },
    })
  ).id;
});

beforeEach(() => {
  enviados.length = 0;
  muertos.clear();
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

describe("avisos al dueño", () => {
  it("cada venta le llega solo al dueño de ese negocio", async () => {
    await avisarVentaGuardada({ id: userId, currency: "COP" }, { tipo: "venta", id: ventaId }, { name: "Andrés" });
    expect(enviados.map((e) => e.endpoint)).toEqual([a("dueno")]);
    expect(enviados[0].payload.title).toContain("Venta nueva");
    expect(enviados[0].payload.body).toContain("1x Lavado");
    expect(enviados[0].payload.body).toContain("Registró Andrés");
  });

  it("no se puede avisar una venta de otro negocio", async () => {
    await avisarVentaGuardada({ id: otroId, currency: "COP" }, { tipo: "venta", id: ventaId }, null);
    expect(enviados).toHaveLength(0);
  });

  it("cada marcaje le llega al dueño con la hora", async () => {
    await avisarMarcaje(
      { id: userId, timezone: "America/Bogota" },
      { nombre: "Jhon", kind: "ENTRADA", markedAt: new Date("2026-09-29T12:42:00Z") }
    );
    expect(enviados.map((e) => e.endpoint)).toEqual([a("dueno")]);
    expect(enviados[0].payload.title).toBe("Jhon marcó entrada");
    expect(enviados[0].payload.body).toMatch(/7:42/);
  });

  it("un celular que ya no existe se borra", async () => {
    muertos.add(a("dueno"));
    await avisarMarcaje({ id: userId, timezone: "America/Bogota" }, { nombre: "Jhon", kind: "SALIDA", markedAt: AHORA });
    expect(await db.pushSubscription.count({ where: { endpoint: a("dueno") } })).toBe(0);
    await suscribir(userId, dueno, "dueno");
  });
});

describe("avisos a los empleados", () => {
  it("al lavador le llega solo lo suyo", async () => {
    await avisarAPersona(userId, lavador, { title: "Te asignaron un carro", body: "SQZ802" });
    expect(enviados.map((e) => e.endpoint)).toEqual([a("lavador")]);
  });

  it("en la mañana se les recuerda marcar entrada al jefe y al lavador, no al dueño", async () => {
    await recordarMarcar("entrada", AHORA);
    const mios = enviados.filter((e) => e.endpoint.endsWith(S)).map((e) => e.endpoint).sort();
    expect(mios).toEqual([a("jefe"), a("lavador")].sort());
    expect(enviados.find((e) => e.endpoint === a("jefe"))?.payload.title).toBe("Buenos días, Andrés");
  });

  it("en la tarde solo a quien tiene entrada sin salida", async () => {
    await db.attendance.create({
      data: { userId, staffId: jefe, kind: "ENTRADA", markedAt: new Date(AHORA.getTime() - 3600000), clientKey: "e-" + S },
    });
    await recordarMarcar("salida", AHORA);
    const mios = enviados.filter((e) => e.endpoint.endsWith(S)).map((e) => e.endpoint);
    expect(mios).toEqual([a("jefe")]);
    expect(enviados[0].payload.body).toContain("medianoche");

    // Y ya no se le recuerda la entrada: ya entró.
    enviados.length = 0;
    await recordarMarcar("entrada", AHORA);
    expect(enviados.filter((e) => e.endpoint.endsWith(S)).map((e) => e.endpoint)).toEqual([a("lavador")]);
  });
});
