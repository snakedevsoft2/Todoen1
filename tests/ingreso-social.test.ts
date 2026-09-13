import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// La sesion se firma con AUTH_SECRET. Las pruebas no leen .env, asi que se
// pone uno de prueba antes de cargar el modulo.
process.env.AUTH_SECRET ??= "secreto-de-prueba-solo-para-vitest-" + "x".repeat(32);
const { decidirIngreso } = await import("../src/lib/ingreso-social");

/**
 * Que pasa cuando alguien vuelve de Google o Facebook con un correo.
 *
 * Los dos proveedores pasan por la misma decision. Aqui queda fijada, porque
 * es la que decide quien entra a que negocio sin haber escrito contrasena.
 */
const db = new PrismaClient();
const S = "soc-" + Date.now();
const correo = (n: string) => n + "-" + S + "@test.local";

let activoId = "";
const ids: string[] = [];

beforeAll(async () => {
  const u = await db.user.create({
    data: {
      email: correo("dueno"),
      passwordHash: "x",
      ownerName: "Dueno",
      businessName: "Soc " + S,
      businessType: "OTRO",
      slug: "soc-" + S,
      staff: {
        create: [
          { name: "Dueno", role: "DUENO" },
          { name: "Activo", email: correo("activo"), passwordHash: "x", role: "VENDEDOR" },
          { name: "Apagado", email: correo("apagado"), passwordHash: "x", role: "VENDEDOR", active: false },
        ],
      },
    },
    include: { staff: true },
  });
  ids.push(u.id);
  activoId = u.staff.find((s) => s.name === "Activo")!.id;

  const susp = await db.user.create({
    data: {
      email: correo("suspendido"),
      passwordHash: "x",
      ownerName: "Susp",
      businessName: "Susp " + S,
      businessType: "OTRO",
      slug: "susp-" + S,
      suspendedAt: new Date(),
      staff: { create: [{ name: "Emp de suspendida", email: correo("empsusp"), passwordHash: "x", role: "VENDEDOR" }] },
    },
  });
  ids.push(susp.id);
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe("volver de Google o Facebook", () => {
  it("el correo de un dueno abre su sesion", async () => {
    const d = await decidirIngreso(correo("dueno"), "Dueno");
    expect(d.tipo).toBe("sesion");
  });

  it("no importan las mayusculas del correo que manda el proveedor", async () => {
    const d = await decidirIngreso("  " + correo("dueno").toUpperCase() + " ", "Dueno");
    expect(d.tipo).toBe("sesion");
  });

  it("el correo de un empleado activo abre su sesion", async () => {
    const d = await decidirIngreso(correo("activo"), "Activo");
    expect(d.tipo).toBe("sesion");
    expect(activoId).not.toBe("");
  });

  it("un empleado desactivado no entra", async () => {
    const d = await decidirIngreso(correo("apagado"), "Apagado");
    expect(d).toEqual({ tipo: "error", motivo: "desactivado" });
  });

  it("una cuenta suspendida no entra, ni su dueno ni su gente", async () => {
    expect(await decidirIngreso(correo("suspendido"), "S")).toEqual({ tipo: "error", motivo: "suspendida" });
    expect(await decidirIngreso(correo("empsusp"), "E")).toEqual({ tipo: "error", motivo: "suspendida" });
  });

  it("un correo que no es de nadie va a crear la cuenta", async () => {
    const d = await decidirIngreso(correo("nuevo"), "Persona Nueva");
    expect(d).toEqual({ tipo: "registro", email: correo("nuevo"), nombre: "Persona Nueva" });
  });
});
