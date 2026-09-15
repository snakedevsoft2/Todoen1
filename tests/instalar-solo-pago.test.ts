import { describe, expect, it } from "vitest";
import { esPlanCompleto, puedeInstalar } from "../src/lib/plan";

/**
 * Instalar la aplicacion en el telefono (y usarla sin senal) es solo de la
 * cuenta que pago. La prueba y la cortesia siguen con todo lo demas, pero desde
 * el navegador.
 */
const DIA = 86_400_000;
const enDias = (d: number) => new Date(Date.now() + d * DIA);

describe("instalar la aplicación", () => {
  it("la cuenta que pagó la instala", () => {
    expect(puedeInstalar({ paidUntil: enDias(30), trialEndsAt: null })).toBe(true);
    // Con prueba vieja y pago registrado despues, manda el pago.
    expect(puedeInstalar({ paidUntil: enDias(30), trialEndsAt: enDias(-20) })).toBe(true);
  });

  it("la prueba y la cortesía tienen todo menos instalar", () => {
    const prueba = { paidUntil: null, trialEndsAt: enDias(5) };
    const cortesia = { paidUntil: null, trialEndsAt: null };
    expect(esPlanCompleto(prueba)).toBe(true);
    expect(puedeInstalar(prueba)).toBe(false);
    expect(esPlanCompleto(cortesia)).toBe(true);
    expect(puedeInstalar(cortesia)).toBe(false);
  });

  it("la versión gratis tampoco la instala", () => {
    const gratis = { paidUntil: null, trialEndsAt: enDias(-1) };
    expect(esPlanCompleto(gratis)).toBe(false);
    expect(puedeInstalar(gratis)).toBe(false);
  });
});
