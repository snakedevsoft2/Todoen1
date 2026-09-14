import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { borrarUbicacionesViejas, cambiarSeguimiento, guardarConsentimiento, recibirUbicaciones, registrarVisitas } from "../src/lib/ubicacion";

/**
 * Ubicacion durante la jornada y llegadas.
 *
 * Lo que se fija: que no se guarde nada si el negocio no lo activo, si la
 * persona no lo acepto o si esta fuera de su jornada; que un reenvio no
 * duplique; y que la llegada quede con su distancia al sitio.
 */
const db = new PrismaClient();
const S = "ubic-" + Date.now();
type Sesion = Parameters<typeof recibirUbicaciones>[0];
let rosa: Sesion;
let otra: Sesion;
let sitioId: string;
const minutos = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

beforeAll(async () => {
  const u = await db.user.create({
    data: {
      email: "gestor-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Jefe",
      businessName: "Obras " + S,
      businessType: "ASISTENCIA",
      slug: "obras-" + S,
      staff: { create: [{ name: "Jefe", role: "DUENO" }, { name: "Rosa", role: "VENDEDOR" }, { name: "Otra", role: "VENDEDOR" }] },
    },
    include: { staff: true },
  });
  const { staff, ...user } = u;
  rosa = { user, staff: staff.find((x) => x.name === "Rosa")! };
  otra = { user, staff: staff.find((x) => x.name === "Otra")! };
  const sitio = await db.workSite.create({ data: { userId: user.id, name: "Obra Norte", lat: 4.65, lng: -74.058, radiusM: 150 } });
  sitioId = sitio.id;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

const ping = (llave: string, at: string, lat = 4.6501, lng = -74.0581) => ({ clientKey: llave + "-" + S, at, lat, lng, accuracyM: 12 });

describe("ubicación durante la jornada", () => {
  it("sin activar ni aceptar, y fuera de la jornada, no guarda nada", async () => {
    const [apagado] = await recibirUbicaciones(rosa, [ping("a", minutos(-30))]);
    expect(apagado.estado).toBe("rechazado");

    await cambiarSeguimiento(rosa.user.id, true);
    const [sinPermiso] = await recibirUbicaciones(rosa, [ping("b", minutos(-30))]);
    expect(sinPermiso.motivo).toMatch(/No has aceptado/);

    await guardarConsentimiento(rosa.staff.id, true);
    const [sinEntrada] = await recibirUbicaciones(rosa, [ping("c", minutos(-30))]);
    expect(sinEntrada.motivo).toMatch(/Fuera de la jornada/);
    expect(await db.locationPing.count({ where: { staffId: rosa.staff.id } })).toBe(0);
  });

  it("dentro de la jornada guarda, sin duplicar ni guardar más de una por minuto", async () => {
    await db.attendance.create({
      data: { userId: rosa.user.id, staffId: rosa.staff.id, kind: "ENTRADA", markedAt: new Date(minutos(-60)), clientKey: "entrada-" + S },
    });
    const r = await recibirUbicaciones(rosa, [ping("d", minutos(-30)), ping("e", minutos(-29.5)), ping("f", minutos(-25))]);
    expect(r.map((x) => x.estado)).toEqual(["guardado", "repetido", "guardado"]);
    const [otraVez] = await recibirUbicaciones(rosa, [ping("d", minutos(-30))]);
    expect(otraVez.estado).toBe("repetido");
    expect(await db.locationPing.count({ where: { staffId: rosa.staff.id } })).toBe(2);

    // La llave de Rosa no le sirve a otra persona.
    await guardarConsentimiento(otra.staff.id, true);
    const [ajena] = await recibirUbicaciones(otra, [ping("d", minutos(-30))]);
    expect(ajena.estado).toBe("rechazado");
  });

  it("rechaza coordenadas imposibles y, después de la salida, deja de guardar", async () => {
    const [mala] = await recibirUbicaciones(rosa, [ping("g", minutos(-20), 123, -74)]);
    expect(mala.motivo).toMatch(/coordenada/);

    await db.attendance.create({
      data: { userId: rosa.user.id, staffId: rosa.staff.id, kind: "SALIDA", markedAt: new Date(minutos(-10)), clientKey: "salida-" + S },
    });
    const [despues] = await recibirUbicaciones(rosa, [ping("h", minutos(-5))]);
    expect(despues.motivo).toMatch(/Fuera de la jornada/);
  });

  it("retirar el permiso detiene el envío", async () => {
    await guardarConsentimiento(rosa.staff.id, false);
    const [r] = await recibirUbicaciones(rosa, [ping("i", minutos(-15))]);
    expect(r.motivo).toMatch(/No has aceptado/);
  });

  it("borra las ubicaciones de hace más de 90 días", async () => {
    await db.locationPing.create({
      data: { userId: rosa.user.id, staffId: rosa.staff.id, at: new Date(Date.now() - 100 * 86_400_000), lat: 4.6, lng: -74, clientKey: "vieja-" + S },
    });
    expect(await borrarUbicacionesViejas()).toBeGreaterThanOrEqual(1);
    expect(await db.locationPing.count({ where: { clientKey: "vieja-" + S } })).toBe(0);
  });
});

describe("llegadas", () => {
  it("queda con la distancia al sitio, sin duplicar, y pide saber a dónde", async () => {
    const llegada = { clientKey: "llegada-" + S, arrivedAt: minutos(-3), siteId: sitioId, place: "", note: "Entrega", lat: 4.6505, lng: -74.0585, accuracyM: 10 };
    const [r] = await registrarVisitas(rosa, [llegada]);
    expect(r.estado).toBe("guardado");
    const guardada = await db.siteVisit.findUniqueOrThrow({ where: { clientKey: llegada.clientKey } });
    expect(guardada.distanceM).toBeGreaterThan(40);
    expect(guardada.distanceM).toBeLessThan(90);
    expect(guardada.staffId).toBe(rosa.staff.id);

    expect((await registrarVisitas(rosa, [llegada]))[0].estado).toBe("repetido");

    const [sinLugar] = await registrarVisitas(rosa, [{ clientKey: "sin-lugar-" + S, arrivedAt: minutos(-2) }]);
    expect(sinLugar.estado).toBe("rechazado");

    const [otroLugar] = await registrarVisitas(rosa, [{ clientKey: "otro-lugar-" + S, arrivedAt: minutos(-1), place: "Donde el cliente Pedro" }]);
    expect(otroLugar.estado).toBe("guardado");

    const [ajeno] = await registrarVisitas(rosa, [{ clientKey: "ajeno-" + S, arrivedAt: minutos(-1), siteId: "sitio-de-otro-negocio" }]);
    expect(ajeno.motivo).toMatch(/no existe/);
  });
});
