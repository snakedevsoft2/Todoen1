import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  DIAS_DE_PRUEBA,
  MARCA_VERSION_GRATIS,
  SOLO_PLAN_PAGO,
  esPlanCompleto,
  finDePrueba,
  motivoSinPlan,
  planDeCuenta,
} from "../src/lib/plan";
import { quitarControlDePago } from "../src/lib/pagos";
import { invoiceTirilla, type InvoiceData } from "../src/lib/invoice";
import { receiptTirilla } from "../src/lib/receipt";
import { recibirUbicaciones, registrarVisitas } from "../src/lib/ubicacion";

/**
 * La prueba gratis y la version gratis.
 *
 * Lo que se fija: que la cuenta con pago o de cortesia tenga todo, que la
 * prueba tenga todo hasta que se acaba, que la version gratis lleve la marca
 * en la factura normal (y no en la autorizada) y en el comprobante, que la
 * cortesia quite la prueba, y que el servidor no reciba ubicaciones ni
 * llegadas de la version gratis aunque el telefono las mande.
 */
const db = new PrismaClient();
const S = "plan-" + Date.now();
const DIA = 86_400_000;
const enDias = (d: number) => new Date(Date.now() + d * DIA);

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

async function cuenta(nombre: string, datos: { paidUntil?: Date | null; trialEndsAt?: Date | null; liveTracking?: boolean } = {}) {
  return db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: nombre,
      businessName: nombre + " " + S,
      businessType: "OTRO",
      slug: nombre + "-" + S,
      ...datos,
      staff: { create: { name: nombre, role: "DUENO", locationConsentAt: new Date() } },
    },
    include: { staff: true },
  });
}

describe("el plan de la cuenta", () => {
  it("con fecha de pago manda el pago; sin fecha y sin prueba es cortesía", () => {
    expect(planDeCuenta({ paidUntil: enDias(-30), trialEndsAt: enDias(-60) }).tipo).toBe("pago");
    expect(planDeCuenta({ paidUntil: null, trialEndsAt: null }).tipo).toBe("cortesia");
    expect(esPlanCompleto({ paidUntil: null, trialEndsAt: null })).toBe(true);
  });

  it("la prueba tiene todo y al acabarse queda la versión gratis", () => {
    const ahora = new Date("2026-09-14T12:00:00Z");
    const hasta = finDePrueba(ahora);
    expect(hasta.getTime() - ahora.getTime()).toBe(DIAS_DE_PRUEBA * DIA);
    expect(planDeCuenta({ paidUntil: null, trialEndsAt: hasta }, ahora)).toMatchObject({ tipo: "prueba", dias: DIAS_DE_PRUEBA });
    expect(esPlanCompleto({ paidUntil: null, trialEndsAt: hasta }, ahora)).toBe(true);

    const despues = new Date(hasta.getTime() + 1);
    expect(planDeCuenta({ paidUntil: null, trialEndsAt: hasta }, despues).tipo).toBe("gratis");
    expect(esPlanCompleto({ paidUntil: null, trialEndsAt: hasta }, despues)).toBe(false);

    expect(motivoSinPlan({ paidUntil: null, trialEndsAt: enDias(-1) })).toBe(SOLO_PLAN_PAGO);
    // Al registrar el pago vuelve a tener todo, aunque la prueba se haya acabado.
    expect(motivoSinPlan({ paidUntil: enDias(30), trialEndsAt: enDias(-1) })).toBeNull();
  });
});

describe("la marca de la versión gratis", () => {
  const base: InvoiceData = {
    saleId: "venta-1",
    businessName: "Tienda",
    businessPhone: null,
    businessAddress: null,
    logoUrl: null,
    currency: "COP",
    day: "2026-09-14",
    clientName: null,
    paymentMethod: "EFECTIVO",
    staffName: null,
    items: [{ name: "Café", qty: 1, unitPrice: 3000 }],
    total: 3000,
    notes: null,
  };
  const conMarca = (lineas: { t: string; text?: string }[]) => lineas.some((l) => l.text === MARCA_VERSION_GRATIS);

  it("sale en la factura normal y no en la autorizada", () => {
    expect(conMarca(invoiceTirilla(base))).toBe(false);
    expect(conMarca(invoiceTirilla({ ...base, marcaGratis: true }))).toBe(true);
    const autorizacion = {
      pais: "CO",
      numero: "SETP990000001",
      etiquetaCodigo: "CUFE",
      codigo: "abc123",
      qr: null,
      fecha: null,
      pruebas: false,
      compradorDocumento: "Consumidor final",
      subtotal: 2521,
      impuesto: 479,
      etiquetaImpuesto: "IVA 19%",
    } as NonNullable<InvoiceData["autorizacion"]>;
    expect(conMarca(invoiceTirilla({ ...base, marcaGratis: true, autorizacion }))).toBe(false);
  });

  it("sale en el comprobante de abono", () => {
    const recibo = {
      paymentId: "pago-1",
      businessName: "Tienda",
      businessPhone: null,
      businessAddress: null,
      logoUrl: null,
      currency: "COP",
      clientName: "Juan",
      concept: "Fiado",
      day: "2026-09-14",
      method: "EFECTIVO",
      amount: 1000,
      total: 5000,
      saldo: 4000,
      historial: [],
    };
    expect(conMarca(receiptTirilla(recibo))).toBe(false);
    expect(conMarca(receiptTirilla({ ...recibo, marcaGratis: true }))).toBe(true);
  });
});

describe("en la base", () => {
  it("dar cortesía quita la prueba: la cuenta no vuelve a la versión gratis", async () => {
    const c = await cuenta("cortesia", { trialEndsAt: enDias(-2) });
    expect(esPlanCompleto(c)).toBe(false);
    await quitarControlDePago(c.id);
    const despues = await db.user.findUniqueOrThrow({ where: { id: c.id } });
    expect(despues.trialEndsAt).toBeNull();
    expect(planDeCuenta(despues).tipo).toBe("cortesia");
  });

  it("la versión gratis no recibe ubicaciones ni llegadas aunque el teléfono las mande", async () => {
    const c = await cuenta("gratis", { trialEndsAt: enDias(-1), liveTracking: true });
    const { staff, ...user } = c;
    const sesion = { user, staff: staff[0] } as Parameters<typeof recibirUbicaciones>[0];
    const ahora = new Date().toISOString();

    const ubicaciones = await recibirUbicaciones(sesion, [{ clientKey: "u-" + S, at: ahora, lat: 4.65, lng: -74.05, accuracy: 10 }]);
    expect(ubicaciones).toEqual([{ clientKey: "u-" + S, estado: "rechazado", motivo: SOLO_PLAN_PAGO }]);

    const llegadas = await registrarVisitas(sesion, [{ clientKey: "v-" + S, arrivedAt: ahora, lat: 4.65, lng: -74.05, accuracy: 10 }]);
    expect(llegadas).toEqual([{ clientKey: "v-" + S, estado: "rechazado", motivo: SOLO_PLAN_PAGO }]);
    expect(await db.locationPing.count({ where: { userId: c.id } })).toBe(0);
    expect(await db.siteVisit.count({ where: { userId: c.id } })).toBe(0);
  });
});
