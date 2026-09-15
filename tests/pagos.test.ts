import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  DIAS_DE_GRACIA,
  MOTIVO_PAGO,
  estadoDePago,
  finDelDia,
  quitarControlDePago,
  registrarPago,
  sumarMeses,
  suspenderSiVencio,
  suspenderVencidas,
} from "../src/lib/pagos";

/**
 * Control de pagos de las cuentas.
 *
 * Lo que se fija: los estados (al dia, por vencer, en gracia, para
 * suspender), que la suspension automatica solo toque cuentas vencidas y sin
 * gracia, que pagar reactive solo lo que suspendio el pago, y que quien paga
 * antes no pierda dias.
 */
const db = new PrismaClient();
const S = "pagos-" + Date.now();
const DIA = 86_400_000;
const enDias = (d: number) => new Date(Date.now() + d * DIA);

async function cuenta(nombre: string, datos: { paidUntil?: Date | null; suspendedAt?: Date | null; suspendedReason?: string | null } = {}) {
  return db.user.create({
    data: {
      email: nombre + "-" + S + "@test.local",
      passwordHash: "x",
      ownerName: nombre,
      businessName: nombre + " " + S,
      businessType: "OTRO",
      slug: nombre + "-" + S,
      ...datos,
    },
  });
}

afterAll(async () => {
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
});

describe("estado del pago", () => {
  it("distingue al día, por vencer, en gracia y para suspender", () => {
    expect(estadoDePago(null).estado).toBe("sin-control");
    expect(estadoDePago(enDias(30)).estado).toBe("al-dia");
    expect(estadoDePago(enDias(3)).estado).toBe("por-vencer");
    const gracia = estadoDePago(enDias(-2));
    expect(gracia.estado).toBe("vencida");
    if (gracia.estado === "vencida") expect(gracia.dias).toBe(DIAS_DE_GRACIA - 2);
    expect(estadoDePago(enDias(-(DIAS_DE_GRACIA + 1))).estado).toBe("suspender");
  });

  it("suma meses sin saltarse al mes siguiente", () => {
    expect(sumarMeses(finDelDia("2026-01-31"), 1).getTime()).toBe(finDelDia("2026-02-28").getTime());
    expect(sumarMeses(finDelDia("2026-11-15"), 3).getTime()).toBe(finDelDia("2027-02-15").getTime());
  });
});

describe("suspender y reactivar", () => {
  it("suspende solo las vencidas sin gracia y no toca las suspensiones a mano", async () => {
    const vencida = await cuenta("vencida", { paidUntil: enDias(-10) });
    const enGracia = await cuenta("gracia", { paidUntil: enDias(-2) });
    const cortesia = await cuenta("cortesia", { paidUntil: null });
    const aMano = await cuenta("amano", { paidUntil: enDias(-10), suspendedAt: enDias(-20), suspendedReason: "Pidió cerrarla" });

    expect(await suspenderVencidas()).toBeGreaterThanOrEqual(1);

    const leer = (id: string) => db.user.findUniqueOrThrow({ where: { id } });
    expect(await leer(vencida.id)).toMatchObject({ suspendedReason: MOTIVO_PAGO, suspendedForPayment: true });
    expect((await leer(enGracia.id)).suspendedAt).toBeNull();
    expect((await leer(cortesia.id)).suspendedAt).toBeNull();
    expect(await leer(aMano.id)).toMatchObject({ suspendedReason: "Pidió cerrarla", suspendedForPayment: false });

    // Pagar reactiva la que suspendio el pago...
    const pago = await registrarPago(vencida.id, { meses: 1, nota: "Nequi" });
    if (!pago.ok) throw new Error(pago.error);
    expect(pago.reactivada).toBe(true);
    const al = await leer(vencida.id);
    expect(al).toMatchObject({ suspendedAt: null, suspendedForPayment: false, billingNote: "Nequi" });
    expect(estadoDePago(al.paidUntil).estado).toMatch(/al-dia|por-vencer/);

    // ...pero no la que se suspendio a mano por otro motivo.
    const otra = await registrarPago(aMano.id, { meses: 1 });
    if (!otra.ok) throw new Error(otra.error);
    expect(otra.reactivada).toBe(false);
    expect((await leer(aMano.id)).suspendedAt).not.toBeNull();
  });

  it("quien paga antes no pierde días, y con fecha a mano se pone esa", async () => {
    const pronto = await cuenta("pronto", { paidUntil: finDelDia("2099-03-10") });
    const r = await registrarPago(pronto.id, { meses: 1 });
    if (!r.ok) throw new Error(r.error);
    expect(r.paidUntil.getTime()).toBe(finDelDia("2099-04-10").getTime());

    const aMano = await registrarPago(pronto.id, { hasta: "2099-12-31" });
    if (!aMano.ok) throw new Error(aMano.error);
    expect(aMano.paidUntil.getTime()).toBe(finDelDia("2099-12-31").getTime());

    expect((await registrarPago(pronto.id, { hasta: "31/12/2099" })).ok).toBe(false);
    expect((await registrarPago(pronto.id, { meses: 0 })).ok).toBe(false);
  });

  it("suspende en el momento a quien ya pasó la gracia, y quitar el control la reactiva", async () => {
    const tarde = await cuenta("tarde", { paidUntil: enDias(-(DIAS_DE_GRACIA + 2)) });
    expect(await suspenderSiVencio(tarde)).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: tarde.id } })).suspendedForPayment).toBe(true);

    await quitarControlDePago(tarde.id);
    expect(await db.user.findUniqueOrThrow({ where: { id: tarde.id } })).toMatchObject({ paidUntil: null, suspendedAt: null });
  });
});
