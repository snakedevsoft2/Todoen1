import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ejecutarAcciones, type Registro } from "../src/lib/sin-senal/ejecutar";

/**
 * Las acciones del panel hechas sin señal.
 *
 * Se prueba el ejecutor con acciones de mentira (las de verdad necesitan la
 * cookie de la sesión, que aquí no existe). Lo que se fija: que una acción no
 * se haga dos veces aunque llegue repetida, que el error de validación quede
 * como rechazo con su motivo, que un redirect sea éxito (o sesión cerrada si
 * manda al ingreso) y que solo se ejecute lo que está en el registro.
 */
const db = new PrismaClient();
const S = "acc-" + Date.now();
type Sesion = Parameters<typeof ejecutarAcciones>[0];
let sesion: Sesion;
let otra: Sesion;
const llamadas: string[] = [];

const redirect = (destino: string) => Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;" + destino + ";307;" });

const registro: Registro = {
  anotar: { kind: "simple", fn: async (fd) => void llamadas.push("anotar:" + fd.get("texto")) },
  conEstado: {
    kind: "estado",
    fn: async (_prev, fd) => (fd.get("monto") === "0" ? { error: "El valor debe ser mayor a cero." } : (llamadas.push("estado:" + fd.get("monto")), { ok: "Listo." })),
  },
  abreFicha: { kind: "simple", fn: async () => { throw redirect("/panel/clientes/123"); } },
  sinSesion: { kind: "simple", fn: async () => { throw redirect("/salir"); } },
  explota: { kind: "simple", fn: async () => { throw new Error("se cayó la base"); } },
};

beforeAll(async () => {
  const u = await db.user.create({
    data: {
      email: "acc-" + S + "@test.local",
      passwordHash: "x",
      ownerName: "Uno",
      businessName: "Negocio " + S,
      businessType: "OTRO",
      slug: "negocio-" + S,
      staff: { create: [{ name: "Uno", role: "DUENO" }, { name: "Dos", role: "VENDEDOR" }] },
    },
    include: { staff: true },
  });
  const { staff, ...user } = u;
  sesion = { user, staff: staff.find((x) => x.name === "Uno")! };
  otra = { user, staff: staff.find((x) => x.name === "Dos")! };
});

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

const accion = (llave: string, nombre: string, campos: [string, string][] = []) => ({ clientKey: llave + "-" + S, accion: nombre, campos });

describe("acciones hechas sin señal", () => {
  it("ejecuta la acción una sola vez aunque llegue repetida", async () => {
    const a = accion("uno", "anotar", [["texto", "hola"]]);
    const primera = await ejecutarAcciones(sesion, [a], registro);
    const segunda = await ejecutarAcciones(sesion, [a], registro);
    expect(primera.resultados[0].estado).toBe("guardado");
    expect(segunda.resultados[0].estado).toBe("repetido");
    expect(llamadas.filter((x) => x === "anotar:hola")).toHaveLength(1);

    // La llave de una persona no le sirve a otra.
    expect((await ejecutarAcciones(otra, [a], registro)).resultados[0].estado).toBe("rechazado");
  });

  it("el error de validación queda como rechazo, con su motivo, también al repetir", async () => {
    const mala = accion("mala", "conEstado", [["monto", "0"]]);
    const r = await ejecutarAcciones(sesion, [mala, accion("buena", "conEstado", [["monto", "5000"]])], registro);
    expect(r.resultados.map((x) => x.estado)).toEqual(["rechazado", "guardado"]);
    expect(r.resultados[0].motivo).toBe("El valor debe ser mayor a cero.");
    expect((await ejecutarAcciones(sesion, [mala], registro)).resultados[0]).toMatchObject({ estado: "rechazado", motivo: "El valor debe ser mayor a cero." });
  });

  it("un redirect a otra pantalla es éxito; al ingreso es sesión cerrada y la llave se suelta", async () => {
    expect((await ejecutarAcciones(sesion, [accion("ficha", "abreFicha")], registro)).resultados[0].estado).toBe("guardado");

    const cerrada = await ejecutarAcciones(sesion, [accion("cerrada", "sinSesion"), accion("despues", "anotar", [["texto", "no"]])], registro);
    expect(cerrada.sinSesion).toBe(true);
    expect(cerrada.resultados).toHaveLength(0);
    expect(llamadas).not.toContain("anotar:no");
    expect(await db.offlineAction.count({ where: { clientKey: "cerrada-" + S } })).toBe(0);
  });

  it("si el servidor falla la deja para reintentar, y rechaza lo que no está en el registro", async () => {
    const r = await ejecutarAcciones(sesion, [accion("falla", "explota"), accion("rara", "borrarTodo"), { clientKey: "x", accion: "anotar", campos: [] }], registro);
    expect(r.resultados.map((x) => x.estado)).toEqual(["reintentar", "rechazado"]);
    expect(await db.offlineAction.count({ where: { clientKey: "falla-" + S } })).toBe(0);
    expect((await ejecutarAcciones(sesion, [accion("campos", "anotar", [["solo-uno"] as unknown as [string, string]])], registro)).resultados[0].estado).toBe("rechazado");
  });
});
