import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { SOLO_DUENO, puedeHacer } from "../src/lib/permisos-empleado";
import { USUARIO_VALIDO, esUsuario, normalizarUsuario } from "../src/lib/usuario";
import { ejecutarAcciones, type Registro } from "../src/lib/sin-senal/ejecutar";
import { anotarActividad } from "../src/lib/actividad";
import { registrarVenta } from "../src/lib/ventas";
import { anotarIntentoDeUsuario, demasiadosIntentosDeUsuario } from "../src/lib/seguridad";

/**
 * El empleado que agrega el dueño.
 *
 * Lo que se fija: que agrega pero no borra ni cambia (tampoco desde la cola sin
 * señal), que el usuario para entrar se escribe sin tildes ni arroba, que probar
 * usuarios a ciegas se frena, y que lo que hace queda en su historial.
 */
const db = new PrismaClient();
const S = "permisos-" + Date.now();
type Sesion = Parameters<typeof ejecutarAcciones>[0];
let dueno: Sesion;
let empleado: Sesion;

beforeAll(async () => {
  const u = await db.user.create({
    data: {
      email: "p-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Dueña",
      businessName: "Negocio " + S,
      businessType: "OTRO",
      slug: "negocio-" + S,
      staff: {
        create: [
          { name: "Dueña", role: "DUENO" },
          { name: "Juliana", role: "VENDEDOR", username: "juliana." + S.replace(/[^a-z0-9]/g, "") },
        ],
      },
    },
    include: { staff: true },
  });
  const { staff, ...user } = u;
  dueno = { user, staff: staff.find((x) => x.role === "DUENO")! };
  empleado = { user, staff: staff.find((x) => x.role === "VENDEDOR")! };
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.securityAttempt.deleteMany({ where: { email: { contains: S } } });
  await db.$disconnect();
});

describe("lo que puede hacer un empleado", () => {
  it("agrega, pero no borra ni cambia lo registrado", () => {
    expect(puedeHacer("VENDEDOR", "createExpenseAction")).toBe(true);
    expect(puedeHacer("VENDEDOR", "addPaymentAction")).toBe(true);
    expect(puedeHacer("VENDEDOR", "closeCashAction")).toBe(true);
    expect(puedeHacer("VENDEDOR", "deleteSaleAction")).toBe(false);
    expect(puedeHacer("VENDEDOR", "updateSalePaymentAction")).toBe(false);
    expect(puedeHacer("VENDEDOR", "cancelDebtAction")).toBe(false);
    expect(puedeHacer("VENDEDOR", "guardarClienteAction", [["name", "Ana"]])).toBe(true);
    expect(puedeHacer("VENDEDOR", "guardarClienteAction", [["id", "c1"], ["name", "Ana"]])).toBe(false);
    expect(puedeHacer("DUENO", "deleteSaleAction")).toBe(true);
  });

  it("sin señal, la cola tampoco le deja borrar", async () => {
    const llamadas: string[] = [];
    const registro: Registro = {
      deleteSaleAction: { kind: "simple", fn: async () => void llamadas.push("borrar") },
      createExpenseAction: { kind: "estado", fn: async () => (llamadas.push("gasto"), { ok: "Listo." }) },
    };
    const accion = (llave: string, nombre: string) => ({ clientKey: llave + "-" + S, accion: nombre, campos: [["id", "x"]] });

    const r = await ejecutarAcciones(empleado, [accion("borra", "deleteSaleAction"), accion("gasto", "createExpenseAction")], registro);
    expect(r.resultados).toEqual([
      { clientKey: "borra-" + S, estado: "rechazado", motivo: SOLO_DUENO },
      { clientKey: "gasto-" + S, estado: "guardado" },
    ]);
    expect(llamadas).toEqual(["gasto"]);

    const delDueno = await ejecutarAcciones(dueno, [accion("borra2", "deleteSaleAction")], registro);
    expect(delDueno.resultados[0].estado).toBe("guardado");
  });
});

describe("el usuario para entrar", () => {
  it("se escribe sin tildes, sin mayúsculas y sin arroba", () => {
    expect(normalizarUsuario("  Julián.Tienda ")).toBe("julian.tienda");
    expect(USUARIO_VALIDO.test("julian.tienda")).toBe(true);
    expect(USUARIO_VALIDO.test("ju")).toBe(false);
    expect(USUARIO_VALIDO.test("ana@x.co")).toBe(false);
    expect(esUsuario("julian.tienda")).toBe(true);
    expect(esUsuario("dueno@correo.com")).toBe(false);
    expect(esUsuario("   ")).toBe(false);
  });

  it("se frena a quien prueba usuarios a ciegas, sin afectar a otras conexiones", async () => {
    const origen = "prueba-" + S;
    expect(await demasiadosIntentosDeUsuario(origen)).toBe(false);
    for (let i = 0; i < 10; i++) await anotarIntentoDeUsuario(origen);
    expect(await demasiadosIntentosDeUsuario(origen)).toBe(true);
    expect(await demasiadosIntentosDeUsuario("otra-" + S)).toBe(false);
  });
});

describe("el historial de lo que hace", () => {
  it("la venta queda anotada a nombre de quien la registró", async () => {
    const r = await registrarVenta(empleado, { manualTotal: "15000", clientName: "Cliente de Juliana" });
    if (!r.ok) throw new Error(r.error);
    const filas = await db.staffActivity.findMany({ where: { staffId: empleado.staff.id } });
    expect(filas).toEqual([expect.objectContaining({ tipo: "venta", monto: 15000, detalle: "Registró una venta a Cliente de Juliana" })]);
    expect(await db.staffActivity.count({ where: { staffId: dueno.staff.id } })).toBe(0);
  });

  it("si no se puede anotar, no tumba la acción", async () => {
    await expect(
      anotarActividad({ user: { id: "no-existe" }, staff: { id: "no-existe" } }, { tipo: "gasto", detalle: "x" })
    ).resolves.toBeUndefined();
  });
});
