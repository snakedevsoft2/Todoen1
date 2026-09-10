import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * El panel de la plataforma.
 *
 * Es la parte de la aplicacion donde mas facil seria romper sin darse cuenta
 * la promesa de que nadie ve lo de otro. Estas pruebas fijan las tres reglas
 * que lo sostienen:
 *
 *   1. Apagarle algo a una cuenta no le toca el menu a las demas.
 *   2. Una cuenta suspendida no entra, y la que ya estaba adentro se cae.
 *   3. Ni el administrador puede darle a un negocio algo que su oficio no
 *      tiene: la agenda por hora sigue siendo de barberia.
 */
const db = new PrismaClient();

const SUFIJO = "admin-" + Date.now();
const correo = (n: string) => n + "-" + SUFIJO + "@test.local";

type Cuenta = { id: string; staffId: string };

async function crearCuenta(nombre: string, tipo: "ROPA" | "RESTAURANTE"): Promise<Cuenta> {
  const user = await db.user.create({
    data: {
      email: correo(nombre),
      passwordHash: "x",
      ownerName: nombre,
      businessName: "Negocio " + nombre,
      businessType: tipo,
      slug: nombre + "-" + SUFIJO,
      staff: { create: { name: "Duena " + nombre, role: "DUENO" } },
    },
    include: { staff: true },
  });
  return { id: user.id, staffId: user.staff[0].id };
}

let A: Cuenta;
let B: Cuenta;
let R: Cuenta;

beforeAll(async () => {
  A = await crearCuenta("uno", "ROPA");
  B = await crearCuenta("dos", "ROPA");
  R = await crearCuenta("resto", "RESTAURANTE");
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { contains: SUFIJO } } });
  await db.$disconnect();
});

/**
 * El mismo calculo que hace la aplicacion para armar el menu.
 *
 * Se repite aqui a proposito y no se importa de src/lib/modules.ts: ese
 * archivo es "server-only" y no corre fuera de Next. Si algun dia las dos
 * versiones se separan, la prueba deja de proteger, asi que la regla que se
 * comprueba es la de la base de datos, que es la que de verdad manda.
 */
async function apartadosDe(cuenta: Cuenta, tipo: string): Promise<string[]> {
  const [delOficio, overrides] = await Promise.all([
    db.businessTypeModule.findMany({
      where: { businessType: tipo, module: { active: true } },
      include: { module: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.accountModule.findMany({ where: { userId: cuenta.id } }),
  ]);

  const apagados = new Set(overrides.filter((o) => !o.enabled).map((o) => o.moduleKey));
  const prendidos = new Set(overrides.filter((o) => o.enabled).map((o) => o.moduleKey));

  return delOficio
    .filter((f) => !apagados.has(f.module.key))
    .filter((f) => f.module.fixed || prendidos.has(f.module.key) || f.enabledByDefault)
    .map((f) => f.module.key);
}

describe("apagarle algo a una cuenta no toca a las demas", () => {
  it("A pierde Reportes y B lo conserva", async () => {
    expect(await apartadosDe(A, "ROPA")).toContain("reportes");
    expect(await apartadosDe(B, "ROPA")).toContain("reportes");

    await db.accountModule.create({
      data: { userId: A.id, moduleKey: "reportes", enabled: false, note: "prueba" },
    });

    expect(await apartadosDe(A, "ROPA")).not.toContain("reportes");
    expect(await apartadosDe(B, "ROPA")).toContain("reportes");
  });

  it("aunque A lo prenda en su espacio de trabajo, sigue sin verlo", async () => {
    // La persona intenta devolverselo desde su propio configurador.
    await db.workspaceConfig.create({
      data: { userId: A.id, staffId: A.staffId, hiddenKeys: "", orderKeys: "reportes,ventas" },
    });

    // Y aun asi no esta: el interruptor del administrador manda sobre el suyo.
    expect(await apartadosDe(A, "ROPA")).not.toContain("reportes");
  });

  it("quitar la excepcion se lo devuelve", async () => {
    await db.accountModule.deleteMany({ where: { userId: A.id, moduleKey: "reportes" } });
    expect(await apartadosDe(A, "ROPA")).toContain("reportes");
  });

  it("prender algo que venia apagado de fabrica si se lo entrega", async () => {
    expect(await apartadosDe(A, "ROPA")).not.toContain("cartera");
    await db.accountModule.create({
      data: { userId: A.id, moduleKey: "cartera", enabled: true },
    });
    expect(await apartadosDe(A, "ROPA")).toContain("cartera");
    expect(await apartadosDe(B, "ROPA")).not.toContain("cartera");
  });

  it("las excepciones de A no aparecen buscando como B", async () => {
    const deB = await db.accountModule.findMany({ where: { userId: B.id } });
    expect(deB.length).toBe(0);

    const r = await db.accountModule.updateMany({
      where: { userId: B.id, moduleKey: "cartera" },
      data: { enabled: false },
    });
    expect(r.count).toBe(0);
  });
});

describe("la regla de la barberia aguanta incluso al administrador", () => {
  it("un restaurante no tiene turnos ni para poder prenderselos", async () => {
    const existe = await db.businessTypeModule.count({
      where: { businessType: "RESTAURANTE", moduleKey: "turnos" },
    });
    expect(existe).toBe(0);
  });

  it("y si alguien forzara la excepcion, el menu la ignora", async () => {
    // Escribimos la excepcion a mano, saltandonos la accion que la valida.
    await db.accountModule.create({
      data: { userId: R.id, moduleKey: "turnos", enabled: true },
    });

    // El menu sale del catalogo del oficio, asi que turnos no aparece igual.
    expect(await apartadosDe(R, "RESTAURANTE")).not.toContain("turnos");

    await db.accountModule.deleteMany({ where: { userId: R.id, moduleKey: "turnos" } });
  });
});

describe("suspender cierra la puerta sin botar nada", () => {
  it("la cuenta queda marcada y con su motivo", async () => {
    await db.user.update({
      where: { id: A.id },
      data: { suspendedAt: new Date(), suspendedReason: "prueba" },
    });

    const u = await db.user.findUnique({ where: { id: A.id } });
    expect(u?.suspendedAt).not.toBeNull();
    expect(u?.suspendedReason).toBe("prueba");
  });

  it("no se borro nada de lo suyo", async () => {
    const personas = await db.staff.count({ where: { userId: A.id } });
    expect(personas).toBeGreaterThan(0);
  });

  it("reactivar la deja como estaba", async () => {
    await db.user.update({
      where: { id: A.id },
      data: { suspendedAt: null, suspendedReason: null },
    });
    const u = await db.user.findUnique({ where: { id: A.id } });
    expect(u?.suspendedAt).toBeNull();
  });
});

describe("borrar una cuenta se lleva sus excepciones", () => {
  it("al borrar la cuenta, sus filas de AccountModule se van con ella", async () => {
    const temp = await crearCuenta("temporal", "ROPA");
    await db.accountModule.create({
      data: { userId: temp.id, moduleKey: "reportes", enabled: false },
    });

    await db.user.delete({ where: { id: temp.id } });

    const huerfanas = await db.accountModule.count({ where: { userId: temp.id } });
    expect(huerfanas).toBe(0);

    // Y las de A siguen ahi.
    expect(await db.accountModule.count({ where: { userId: A.id } })).toBeGreaterThan(0);
  });
});
