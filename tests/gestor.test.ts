import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { motivoParaRechazar } from "../src/lib/jornada-reglas";
import { cubreDia, diasQueCubre, validarNovedad } from "../src/lib/novedades";
import { agregarFoto, crearInforme, enviarInforme, puedeVerInforme } from "../src/lib/informes";
import { crearNovedad } from "../src/lib/novedades-servidor";
import { esEmpleadoDeAsistencia, rutaDeEmpleadoAsistencia } from "../src/lib/permisos";
import { etiquetaDeRol } from "../src/lib/staff";

/**
 * El gestor de asistencia.
 *
 * Lo que se fija: una entrada y una salida por jornada (tambien de noche y con
 * anulados), que lo que llega de la cola del telefono no se duplique al
 * reintentar, y que un empleado no alcance lo de otro.
 */
const db = new PrismaClient();
const S = "gestor-" + Date.now();
const FOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function negocio(nombre: string) {
  return db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: nombre,
      businessName: "Gestor " + nombre,
      businessType: "ASISTENCIA",
      slug: nombre + "-" + S,
      timezone: "America/Bogota",
      staff: {
        create: [
          { name: "Admin " + nombre, role: "DUENO" },
          { name: "Juan " + nombre, role: "VENDEDOR" },
          { name: "Rosa " + nombre, role: "VENDEDOR" },
        ],
      },
    },
    include: { staff: true },
  });
}

let A: Awaited<ReturnType<typeof negocio>>;
let B: Awaited<ReturnType<typeof negocio>>;
const persona = (u: typeof A, prefijo: string) => u.staff.find((s) => s.name.startsWith(prefijo))!;

beforeAll(async () => {
  A = await negocio("a");
  B = await negocio("b");
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [A.id, B.id] } } });
  await db.$disconnect();
});

describe("permisos y nombres", () => {
  it("el empleado del gestor solo abre sus cuatro pantallas", () => {
    expect(esEmpleadoDeAsistencia({ businessType: "ASISTENCIA" }, { role: "VENDEDOR" })).toBe(true);
    expect(esEmpleadoDeAsistencia({ businessType: "ASISTENCIA" }, { role: "DUENO" })).toBe(false);
    expect(esEmpleadoDeAsistencia({ businessType: "ROPA" }, { role: "VENDEDOR" })).toBe(false);
    expect(rutaDeEmpleadoAsistencia("/panel/marcar")).toBe(true);
    expect(rutaDeEmpleadoAsistencia("/panel/informes/abc")).toBe(true);
    expect(rutaDeEmpleadoAsistencia("/panel/perfil")).toBe(true);
    expect(rutaDeEmpleadoAsistencia("/panel")).toBe(false);
    expect(rutaDeEmpleadoAsistencia("/panel/ventas")).toBe(false);
    expect(rutaDeEmpleadoAsistencia("/panel/marcarx")).toBe(false);
  });

  it("nadie sale como vendedor en el gestor de asistencia", () => {
    expect(etiquetaDeRol("VENDEDOR", "ASISTENCIA")).toBe("Empleado");
    expect(etiquetaDeRol("DUENO", "ASISTENCIA")).toBe("Administrador");
    expect(etiquetaDeRol("DUENO", "ROPA")).toBe("Dueño");
    expect(etiquetaDeRol("BARBERO", "BARBERIA")).toBe("Barbero");
    expect(etiquetaDeRol("VENDEDOR", "CARTERA")).toBe("Cobrador");
  });
});

describe("novedades: reglas", () => {
  const hoy = "2026-09-13";
  const base = { kind: "PERMISO", fromDay: hoy, toDay: hoy, reason: "Cita médica" };

  it("acepta una novedad normal y completa el ultimo dia", () => {
    const r = validarNovedad({ ...base, toDay: "" }, hoy);
    expect(r).toEqual({
      ok: true,
      datos: { kind: "PERMISO", fromDay: hoy, toDay: hoy, fromTime: null, toTime: null, reason: "Cita médica" },
    });
  });

  it("rechaza lo que no cuadra", () => {
    expect(validarNovedad({ ...base, kind: "FIESTA" }, hoy).ok).toBe(false);
    expect(validarNovedad({ ...base, toDay: "2026-09-10" }, hoy).ok).toBe(false);
    expect(validarNovedad({ ...base, reason: "x" }, hoy).ok).toBe(false);
    expect(validarNovedad({ ...base, fromTime: "10:00", toTime: "09:00" }, hoy).ok).toBe(false);
    expect(validarNovedad({ ...base, fromTime: "25:00" }, hoy).ok).toBe(false);
    expect(validarNovedad({ ...base, fromDay: "2026-06-01", toDay: "2026-06-01" }, hoy).ok).toBe(false);
    expect(validarNovedad({ ...base, toDay: "2026-12-31" }, hoy).ok).toBe(false);
  });

  it("cuenta los dias que cubre", () => {
    expect(diasQueCubre("2026-09-01", "2026-09-03")).toBe(3);
    expect(cubreDia({ fromDay: "2026-09-01", toDay: "2026-09-03" }, "2026-09-03")).toBe(true);
    expect(cubreDia({ fromDay: "2026-09-01", toDay: "2026-09-03" }, "2026-09-04")).toBe(false);
  });
});

describe("una entrada y una salida por jornada", () => {
  const tz = "America/Bogota";
  const h = (iso: string) => new Date(iso);
  const marcar = (staffId: string, kind: "ENTRADA" | "SALIDA", markedAt: Date, extra: object = {}) =>
    db.attendance.create({
      data: { userId: A.id, staffId, kind, markedAt, clientKey: "k-" + Math.random().toString(36).slice(2), ...extra },
    });

  it("aplica la regla dia por dia", async () => {
    const juan = persona(A, "Juan").id;
    // 8:00 a. m. en Bogota.
    expect(await motivoParaRechazar(juan, tz, "SALIDA", h("2026-08-10T13:00:00Z"))).toMatch(/Primero marca la entrada/);
    expect(await motivoParaRechazar(juan, tz, "ENTRADA", h("2026-08-10T13:00:00Z"))).toBeNull();
    await marcar(juan, "ENTRADA", h("2026-08-10T13:00:00Z"));

    expect(await motivoParaRechazar(juan, tz, "ENTRADA", h("2026-08-10T15:00:00Z"))).toMatch(/Ya marcaste la entrada/);
    expect(await motivoParaRechazar(juan, tz, "SALIDA", h("2026-08-10T21:00:00Z"))).toBeNull();
    await marcar(juan, "SALIDA", h("2026-08-10T21:00:00Z"));

    expect(await motivoParaRechazar(juan, tz, "SALIDA", h("2026-08-10T22:00:00Z"))).toMatch(/Ya marcaste la salida/);
    // Aunque sean las 8 p. m. en Bogota, sigue siendo el mismo dia: no hay otra entrada.
    expect(await motivoParaRechazar(juan, tz, "ENTRADA", h("2026-08-11T01:00:00Z"))).toMatch(/Ya marcaste la entrada/);
    // Al dia siguiente, si.
    expect(await motivoParaRechazar(juan, tz, "ENTRADA", h("2026-08-11T13:00:00Z"))).toBeNull();
  });

  it("el turno de noche sale al otro dia", async () => {
    const rosa = persona(A, "Rosa").id;
    // Entra a las 10 p. m. y sale a las 6 a. m. del dia siguiente.
    await marcar(rosa, "ENTRADA", h("2026-08-12T03:00:00Z"));
    expect(await motivoParaRechazar(rosa, tz, "SALIDA", h("2026-08-12T11:00:00Z"))).toBeNull();
    // Y no puede abrir otra entrada sin cerrar la que tiene.
    expect(await motivoParaRechazar(rosa, tz, "ENTRADA", h("2026-08-12T13:00:00Z"))).toMatch(/entrada sin salida/);
  });

  it("un marcaje anulado no cuenta", async () => {
    const juanB = persona(B, "Juan").id;
    await db.attendance.create({
      data: {
        userId: B.id,
        staffId: juanB,
        kind: "ENTRADA",
        markedAt: h("2026-08-15T13:00:00Z"),
        clientKey: "anulado-" + S,
        voidedAt: new Date(),
        voidedReason: "Se equivocó de sitio",
      },
    });
    expect(await motivoParaRechazar(juanB, tz, "ENTRADA", h("2026-08-15T13:30:00Z"))).toBeNull();
  });
});

describe("reportes desde la cola del telefono", () => {
  const sesion = (u: typeof A, prefijo: string) => ({ user: u, staff: persona(u, prefijo) });

  it("reintentar no duplica el reporte ni las fotos", async () => {
    const s = sesion(A, "Juan");
    const llave = "reporte-" + S;
    const uno = await crearInforme(s, { clientKey: llave, title: "Visita obra", day: "2026-09-13" });
    const dos = await crearInforme(s, { clientKey: llave, title: "Visita obra", day: "2026-09-13" });
    expect(uno.ok && dos.ok).toBe(true);
    if (!uno.ok || !dos.ok) return;
    expect(dos.datos).toEqual({ id: uno.datos.id, repetido: true });

    const f1 = await agregarFoto(s, uno.datos.id, { clientKey: llave + ":0", image: FOTO });
    const f2 = await agregarFoto(s, uno.datos.id, { clientKey: llave + ":0", image: FOTO });
    expect(f1.ok && f2.ok && f2.datos.repetido).toBe(true);
    expect(await db.visitPhoto.count({ where: { reportId: uno.datos.id } })).toBe(1);
    expect((await agregarFoto(s, uno.datos.id, { clientKey: llave + ":1", image: "no es foto" })).ok).toBe(false);

    const e1 = await enviarInforme(s, uno.datos.id);
    const e2 = await enviarInforme(s, uno.datos.id);
    expect(e1.ok && !e1.datos.yaEstaba).toBe(true);
    expect(e2.ok && e2.datos.yaEstaba).toBe(true);
    const guardado = await db.visitReport.findUniqueOrThrow({ where: { id: uno.datos.id } });
    expect(guardado.sentAt).not.toBeNull();
    // Lo mando un empleado: al administrador le aparece como nuevo.
    expect(guardado.seenAt).toBeNull();
  });

  it("un empleado no toca el reporte de otro, ni otro negocio usa la misma llave", async () => {
    const juan = sesion(A, "Juan");
    const rosa = sesion(A, "Rosa");
    const r = await crearInforme(juan, { clientKey: "privado-" + S, title: "De Juan" });
    if (!r.ok) throw new Error(r.error);
    const informe = await db.visitReport.findUniqueOrThrow({ where: { id: r.datos.id } });

    expect(puedeVerInforme(rosa.staff, informe)).toBe(false);
    expect(puedeVerInforme(sesion(A, "Admin").staff, informe)).toBe(true);
    expect((await agregarFoto(rosa, informe.id, { image: FOTO })).ok).toBe(false);
    expect((await enviarInforme(rosa, informe.id)).ok).toBe(false);

    const ajeno = await crearInforme(sesion(B, "Juan"), { clientKey: "privado-" + S, title: "Otro" });
    expect(ajeno.ok).toBe(false);
  });

  it("el reporte que hace el administrador no le sale como nuevo", async () => {
    const admin = sesion(A, "Admin");
    const r = await crearInforme(admin, { clientKey: "admin-" + S, title: "Mío" });
    if (!r.ok) throw new Error(r.error);
    await enviarInforme(admin, r.datos.id);
    const guardado = await db.visitReport.findUniqueOrThrow({ where: { id: r.datos.id } });
    expect(guardado.seenAt).not.toBeNull();
  });
});

describe("novedades desde la cola del telefono", () => {
  it("se guarda una sola vez aunque llegue repetida", async () => {
    const s = { user: A, staff: persona(A, "Juan") };
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const datos = { clientKey: "novedad-" + S, kind: "LLEGADA_TARDE", fromDay: hoy, fromTime: "08:00", toTime: "10:00", reason: "Trancón en la autopista" };
    const uno = await crearNovedad(s, datos);
    const dos = await crearNovedad(s, datos);
    expect(uno.ok && dos.ok && dos.datos.repetido).toBe(true);
    expect(await db.novelty.count({ where: { clientKey: "novedad-" + S } })).toBe(1);

    expect((await crearNovedad(s, { ...datos, clientKey: "mala-" + S, reason: "" })).ok).toBe(false);
    expect((await crearNovedad(s, { ...datos, clientKey: "foto-" + S, photo: "data:text/html;base64,PHNjcmlwdD4=" })).ok).toBe(false);
    // Otro empleado no puede reusar la llave.
    expect((await crearNovedad({ user: A, staff: persona(A, "Rosa") }, datos)).ok).toBe(false);
  });
});
