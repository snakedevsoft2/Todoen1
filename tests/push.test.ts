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
const { armarResumen, diaParaResumir, mandarResumenes } = await import("../src/lib/resumen-dia");
const { precioMuyBajo, precioRaro } = await import("../src/lib/precio-raro");
const { money } = await import("../src/lib/format");
const $ = (n: number) => money(n, "COP");

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

describe("precio raro", () => {
  it("menos de la mitad es muy bajo; más del triple también es raro", () => {
    expect(precioMuyBajo(30, 25000)).toBe(true);
    expect(precioMuyBajo(12000, 25000)).toBe(true);
    expect(precioMuyBajo(20000, 25000)).toBe(false);
    expect(precioRaro(80000, 25000)).toBe(true);
    expect(precioRaro(30000, 25000)).toBe(false);
    // Sin precio de catálogo no hay con qué comparar.
    expect(precioRaro(30, null)).toBe(false);
    expect(precioRaro(30, 0)).toBe(false);
  });

  it("una venta muy por debajo del catálogo le avisa aparte al dueño", async () => {
    const moto = await db.service.create({ data: { userId, name: "Moto mediana", price: 25000 } });
    const venta = await db.sale.create({
      data: {
        userId,
        day: "2026-09-29",
        total: 30,
        paymentMethod: "EFECTIVO",
        items: { create: [{ userId, serviceId: moto.id, name: "Moto mediana", unitPrice: 30, qty: 1 }] },
      },
    });
    await avisarVentaGuardada({ id: userId, currency: "COP" }, { tipo: "venta", id: venta.id }, { name: "Juan" });
    const titulos = enviados.map((e) => e.payload.title);
    expect(titulos).toContain("Revisa esta venta: precio muy bajo");
    const aviso = enviados.find((e) => e.payload.title.startsWith("Revisa"))!;
    expect(aviso.endpoint).toBe(a("dueno"));
    expect(aviso.payload.body).toContain("Moto mediana: se cobró " + $(30));
    expect(aviso.payload.body).toContain("normal " + $(25000));
    expect(aviso.payload.body).toContain("Registró Juan");
  });

  it("una venta a precio normal no avisa nada extra", async () => {
    await avisarVentaGuardada({ id: userId, currency: "COP" }, { tipo: "venta", id: ventaId }, null);
    expect(enviados.map((e) => e.payload.title).some((t) => t.startsWith("Revisa"))).toBe(false);
  });
});

describe("resumen del día", () => {
  it("dice los carros, la plata y cuánto lavó cada uno, con las cifras del panel", async () => {
    const dia = "2026-09-20";
    const andrea = await db.staff.create({ data: { userId, name: "Andrea López", role: "VENDEDOR", commissionPct: 50 } });
    for (const total of [20000, 30000]) {
      await db.sale.create({
        data: { userId, day: dia, total, paymentMethod: "EFECTIVO", origin: "LAVADO", staffId: andrea.id, items: { create: [{ userId, name: "Lavado", unitPrice: total, qty: 1 }] } },
      });
    }
    await db.sale.create({
      data: { userId, day: dia, total: 25000, paymentMethod: "EFECTIVO", origin: "LAVADO", staffId: lavador, items: { create: [{ userId, name: "Moto", unitPrice: 25000, qty: 1 }] } },
    });

    const aviso = await armarResumen({ id: userId, currency: "COP", businessType: "LAVADERO" }, dia);
    expect(aviso?.title).toBe("Resumen del día · " + $(75000));
    expect(aviso?.body).toContain("3 carros · " + $(75000));
    expect(aviso?.body).toContain("Para lavadores " + $(25000));
    expect(aviso?.body).toContain("Andrea 2, Jhon 1");
  });

  it("un día sin ventas no manda nada", async () => {
    expect(await armarResumen({ id: userId, currency: "COP", businessType: "LAVADERO" }, "2026-01-01")).toBeNull();
  });

  it("le llega solo al dueño, y nunca a otro negocio", async () => {
    // 21:15 en Bogotá del 29: se resume el 29, que tiene la venta de $20.000.
    await mandarResumenes(new Date("2026-09-30T02:15:00Z"));
    const mios = enviados.filter((e) => e.endpoint.endsWith(S));
    expect(mios.map((e) => e.endpoint)).toEqual([a("dueno")]);
    expect(mios[0].payload.title).toContain("Resumen del día");
  });

  it("si allá ya es de madrugada, resume el día de ayer", () => {
    // 02:15 UTC del 30 = 21:15 del 29 en Bogotá, y 04:15 del 30 en Madrid.
    const cron = new Date("2026-09-30T02:15:00Z");
    expect(diaParaResumir("America/Bogota", cron)).toBe("2026-09-29");
    expect(diaParaResumir("Europe/Madrid", cron)).toBe("2026-09-29");
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
