import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { cifrar, descifrar } from "../src/lib/facturacion/cifrado";
import { lineasFiscales } from "../src/lib/facturacion/impuestos";
import { digitoVerificacion, leerComprador } from "../src/lib/facturacion/paises";
import { emitirFactura, guardarConfiguracion, configuracionFacturacion, reintentarFacturas } from "../src/lib/facturacion";

/**
 * Factura autorizada (DIAN con Factus, SRI con Datil).
 *
 * Los proveedores se reemplazan por un servidor de mentira. Lo que se fija:
 * que los precios viajen sin impuesto, que una venta no se facture dos veces,
 * que un rechazo quede con su motivo y se pueda reintentar, que si Factus ya
 * tenia la factura se recupere, que en Ecuador la autorizacion que tarda se
 * complete sola, y que las credenciales no queden legibles.
 */
const db = new PrismaClient();
const S = "fe-" + Date.now();

type Peticion = { metodo: string; ruta: string; cuerpo: Record<string, unknown> };
let peticiones: Peticion[] = [];
let modoFactus: "ok" | "rechazo" | "duplicada" = "ok";
let servidor: http.Server;

beforeAll(async () => {
  process.env.FACTURACION_SECRET = "secreto-de-prueba-facturacion-1234567890";
  servidor = http.createServer((req, res) => {
    let crudo = "";
    req.on("data", (c) => (crudo += c));
    req.on("end", () => {
      const ruta = req.url ?? "";
      let cuerpo: Record<string, unknown> = {};
      try {
        cuerpo = crudo ? JSON.parse(crudo) : {};
      } catch {
        cuerpo = Object.fromEntries(new URLSearchParams(crudo));
      }
      peticiones.push({ metodo: req.method ?? "", ruta, cuerpo });
      const responder = (status: number, datos: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(datos));
      };

      if (ruta === "/factus/oauth/token") return responder(200, { token_type: "Bearer", expires_in: 600, access_token: "tok" });
      if (ruta === "/factus/v2/bills/validate") {
        if (modoFactus === "rechazo") return responder(422, { message: "Validación", data: { errors: { FAJ44b: "NIT del adquiriente no válido" } } });
        if (modoFactus === "duplicada") return responder(409, { message: "El código de referencia ya existe" });
        return responder(201, {
          status: "Created",
          data: {
            bill: {
              reference_code: cuerpo.reference_code,
              number: "SETP990000001",
              cufe: "cufe-" + S,
              is_validated: true,
              links: { qr: "https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=cufe-" + S, public_url: "https://factus.test/f/1" },
            },
          },
        });
      }
      if (ruta.startsWith("/factus/v2/bills?")) {
        const ref = decodeURIComponent(ruta.split("=")[1] ?? "");
        return responder(200, { data: { data: [{ reference_code: ref, number: "SETP990000009", cufe: "cufe-recuperado", status: 1 }] } });
      }
      if (ruta === "/datil/invoices/issue") return responder(200, { id: "dat-1", estado: "RECIBIDO", clave_acceso: "1409202601099" + S });
      if (ruta === "/datil/invoices/dat-1") {
        return responder(200, {
          id: "dat-1",
          clave_acceso: "1409202601099" + S,
          estado: "AUTORIZADO",
          autorizacion: { estado: "AUTORIZADO", fecha: "2026-09-14T10:00:00" },
        });
      }
      responder(404, { message: "no existe" });
    });
  });
  await new Promise<void>((r) => servidor.listen(0, r));
  const puerto = (servidor.address() as AddressInfo).port;
  process.env.FACTUS_BASE_URL = "http://127.0.0.1:" + puerto + "/factus";
  process.env.DATIL_BASE_URL = "http://127.0.0.1:" + puerto + "/datil";
});

afterAll(async () => {
  servidor.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

beforeEach(() => {
  peticiones = [];
  modoFactus = "ok";
});

async function negocio(nombre: string, currency: string) {
  const u = await db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: nombre,
      businessName: nombre + " " + S,
      businessType: "OTRO",
      slug: nombre + "-" + S,
      currency,
      staff: { create: { name: nombre, role: "DUENO" } },
    },
    include: { staff: true },
  });
  const { staff, ...user } = u;
  return { user, staff: staff[0] };
}

async function venta(userId: string, items: { name: string; unitPrice: number; qty: number }[]) {
  return db.sale.create({
    data: {
      userId,
      day: "2026-09-14",
      total: items.reduce((t, i) => t + i.unitPrice * i.qty, 0),
      items: { create: items.map((i) => ({ ...i, userId })) },
    },
  });
}

describe("piezas", () => {
  it("las credenciales se cifran y no se pueden alterar", () => {
    const c = cifrar({ password: "clave-secreta" });
    expect(c.startsWith("v1:")).toBe(true);
    expect(c).not.toContain("clave-secreta");
    expect(descifrar(c)).toEqual({ password: "clave-secreta" });
    expect(descifrar(c.slice(0, -4) + "AAAA")).toBeNull();
  });

  it("calcula el dígito de verificación del NIT", () => {
    expect(digitoVerificacion("800197268")).toBe("4");
    // 9·41 + 3·23 + 7·19 + 3·17 + 1·13 + 1·7 + 5·3 = 657; 657 mod 11 = 8; 11 − 8 = 3.
    expect(digitoVerificacion("900.373.115")).toBe("3");
  });

  it("separa el impuesto del precio de venta", () => {
    const co = lineasFiscales([{ name: "Camisa", qty: 2, unitPrice: 11900 }], "COP", 19, 2);
    expect(co.lineas[0].precioNeto).toBe(10000);
    expect(co.totales).toEqual({ base: 20000, impuesto: 3800, total: 23800 });
    // En dolares la app guarda centavos.
    const ec = lineasFiscales([{ name: "Almuerzo", qty: 1, unitPrice: 1150 }], "USD", 15, 2);
    expect(ec.totales).toEqual({ base: 10, impuesto: 1.5, total: 11.5 });
  });

  it("en Ecuador limita el consumidor final y revisa la cédula", () => {
    expect(leerComprador("EC", { consumidorFinal: true }, 49).ok).toBe(true);
    expect(leerComprador("EC", { consumidorFinal: true }, 51).ok).toBe(false);
    expect(leerComprador("EC", { tipoDocumento: "05", numero: "12345", nombre: "Ana" }, 10).ok).toBe(false);
    expect(leerComprador("EC", { tipoDocumento: "05", numero: "1712345678", nombre: "Ana" }, 10).ok).toBe(true);
  });
});

describe("configuración", () => {
  it("no se activa sin credenciales y no devuelve las claves", async () => {
    const s = await negocio("config", "COP");
    const sin = await guardarConfiguracion(s.user.id, { enabled: "on", country: "CO", taxKey: "01-19" });
    expect(sin.ok).toBe(false);

    const con = await guardarConfiguracion(s.user.id, {
      enabled: "on",
      country: "CO",
      taxKey: "01-19",
      clientId: "id",
      clientSecret: "secreto",
      username: "u@test.local",
      password: "clave-factus",
    });
    if (!con.ok) throw new Error(con.error);
    expect(con.datos.credencialesGuardadas).toBe(true);
    expect(JSON.stringify(con.datos)).not.toContain("clave-factus");
    const fila = await db.billingConfig.findUniqueOrThrow({ where: { userId: s.user.id } });
    expect(fila.credentials).not.toContain("clave-factus");

    // Dejar las claves vacias al guardar otra vez no las borra.
    const otra = await guardarConfiguracion(s.user.id, { enabled: "on", country: "CO", taxKey: "04-8" });
    if (!otra.ok) throw new Error(otra.error);
    expect((await configuracionFacturacion(s.user.id)).credencialesGuardadas).toBe(true);
    expect(otra.datos.taxKey).toBe("04-8");
  });
});

describe("Colombia con Factus", () => {
  async function listo() {
    const s = await negocio("co" + Math.random().toString(36).slice(2, 6), "COP");
    const r = await guardarConfiguracion(s.user.id, {
      enabled: "on",
      country: "CO",
      taxKey: "01-19",
      clientId: "id",
      clientSecret: "secreto",
      username: "u@test.local",
      password: "clave",
    });
    if (!r.ok) throw new Error(r.error);
    return s;
  }

  it("emite con precios sin IVA y no factura dos veces la misma venta", async () => {
    const s = await listo();
    const v = await venta(s.user.id, [{ name: "Camisa", unitPrice: 11900, qty: 2 }]);
    const r = await emitirFactura(s, v.id, { consumidorFinal: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.datos.estado).toBe("AUTORIZADA");
    expect(r.datos.numero).toBe("SETP990000001");
    expect(r.datos.subtotal).toBe(20000);
    expect(r.datos.impuesto).toBe(3800);

    const envio = peticiones.find((p) => p.ruta.endsWith("/bills/validate"))!;
    const item = (envio.cuerpo.items as Record<string, unknown>[])[0];
    expect(item.price).toBe("10000.00");
    expect(item.taxes).toEqual([{ code: "01", rate: "19.00" }]);
    expect((envio.cuerpo.customer as Record<string, unknown>).identification).toBe("222222222222");
    expect(envio.cuerpo.reference_code).toBe("TEN-" + v.id);

    const otra = await emitirFactura(s, v.id, { consumidorFinal: true });
    if (!otra.ok) throw new Error(otra.error);
    expect(otra.datos.id).toBe(r.datos.id);
    expect(peticiones.filter((p) => p.ruta.endsWith("/bills/validate"))).toHaveLength(1);
  });

  it("un rechazo queda con el motivo y se puede corregir y reintentar", async () => {
    const s = await listo();
    const v = await venta(s.user.id, [{ name: "Servicio", unitPrice: 50000, qty: 1 }]);
    modoFactus = "rechazo";
    const mala = await emitirFactura(s, v.id, { tipoDocumento: "31", numero: "900373115", nombre: "Empresa SAS", esEmpresa: true });
    if (!mala.ok) throw new Error(mala.error);
    expect(mala.datos.estado).toBe("RECHAZADA");
    expect(mala.datos.mensaje).toContain("NIT del adquiriente no válido");

    modoFactus = "ok";
    const buena = await emitirFactura(s, v.id, { tipoDocumento: "31", numero: "900373115", nombre: "Empresa SAS", esEmpresa: true });
    if (!buena.ok) throw new Error(buena.error);
    expect(buena.datos.estado).toBe("AUTORIZADA");
    const fila = await db.electronicInvoice.findUniqueOrThrow({ where: { saleId: v.id } });
    expect(fila.attempts).toBe(2);
    const envio = peticiones.find((p) => p.ruta.endsWith("/bills/validate"))!;
    expect(envio.cuerpo.customer).toMatchObject({ identification: "900373115", dv: "3", company: "Empresa SAS", legal_organization_code: "1" });
  });

  it("si Factus ya la tenía, la recupera en vez de fallar", async () => {
    const s = await listo();
    const v = await venta(s.user.id, [{ name: "Corte", unitPrice: 20000, qty: 1 }]);
    modoFactus = "duplicada";
    const r = await emitirFactura(s, v.id, { consumidorFinal: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.datos.estado).toBe("AUTORIZADA");
    expect(r.datos.numero).toBe("SETP990000009");
  });

  it("no emite si la moneda del negocio no es la del país", async () => {
    const s = await listo();
    await db.user.update({ where: { id: s.user.id }, data: { currency: "USD" } });
    const v = await venta(s.user.id, [{ name: "Corte", unitPrice: 2000, qty: 1 }]);
    const r = await emitirFactura({ ...s, user: { ...s.user, currency: "USD" } }, v.id, { consumidorFinal: true });
    expect(r.ok).toBe(false);
  });
});

describe("Ecuador con Dátil", () => {
  it("la autorización que tarda se completa sola y el secuencial avanza", async () => {
    const s = await negocio("ec", "USD");
    const cfg = await guardarConfiguracion(s.user.id, {
      enabled: "on",
      country: "EC",
      taxKey: "2-15",
      apiKey: "llave",
      certPassword: "firma",
      taxId: "1790012345001",
      legalName: "Comidas del Valle S.A.",
      fiscalAddress: "Av. Amazonas y Colón",
      establishment: "001",
      emissionPoint: "002",
      nextSequential: "7",
    });
    if (!cfg.ok) throw new Error(cfg.error);

    const grande = await venta(s.user.id, [{ name: "Banquete", unitPrice: 6000, qty: 1 }]);
    expect((await emitirFactura(s, grande.id, { consumidorFinal: true })).ok).toBe(false);

    const v = await venta(s.user.id, [{ name: "Almuerzo", unitPrice: 1150, qty: 2 }]);
    const r = await emitirFactura(s, v.id, { consumidorFinal: true, correo: "cliente@test.local" });
    if (!r.ok) throw new Error(r.error);
    expect(r.datos.estado).toBe("ENVIANDO");
    expect(r.datos.numero).toBe("001-002-000000007");

    const envio = peticiones.find((p) => p.ruta.endsWith("/invoices/issue"))!;
    expect(envio.cuerpo.secuencial).toBe(7);
    expect(envio.cuerpo.comprador).toMatchObject({ identificacion: "9999999999999", tipo_identificacion: "07" });
    expect(envio.cuerpo.totales).toMatchObject({ total_sin_impuestos: 20, importe_total: 23 });
    expect((envio.cuerpo.totales as { impuestos: Record<string, unknown>[] }).impuestos[0]).toMatchObject({ codigo: "2", codigo_porcentaje: "4", valor: 3 });

    // La consulta automatica la encuentra autorizada.
    await db.$executeRaw`UPDATE "ElectronicInvoice" SET "updatedAt" = now() - interval '1 minute' WHERE "saleId" = ${v.id}`;
    await reintentarFacturas();
    const fila = await db.electronicInvoice.findUniqueOrThrow({ where: { saleId: v.id } });
    expect(fila.status).toBe("AUTORIZADA");
    expect(fila.authCode).toContain(S);
    expect((await db.billingConfig.findUniqueOrThrow({ where: { userId: s.user.id } })).nextSequential).toBe(8);
  });
});
