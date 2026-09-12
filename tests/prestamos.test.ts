import { describe, expect, it } from "vitest";
import {
  estadoPrestamo,
  ganancia,
  planDeCuotas,
  planDeDeuda,
  esPrestamo,
  totalConInteres,
  valorCuota,
} from "../src/lib/prestamos";

/**
 * Las cuentas del prestamo.
 *
 * Son las unicas de la aplicacion donde equivocarse le cuesta plata de verdad
 * a alguien: si la cuota sale mal, el negocio cobra de menos todos los dias
 * sin darse cuenta, o le cobra de mas al cliente. Por eso van fijadas aqui una
 * por una, sin base de datos de por medio.
 */

describe("interes", () => {
  it("presta 500 al 20% y devuelve 600", () => {
    expect(totalConInteres(500000, 20)).toBe(600000);
    expect(ganancia(500000, 20)).toBe(100000);
  });

  it("sin interes devuelve lo mismo que presto", () => {
    expect(totalConInteres(300000, 0)).toBe(300000);
    expect(ganancia(300000, 0)).toBe(0);
  });

  it("no acepta interes negativo, que seria regalar plata", () => {
    expect(totalConInteres(100000, -50)).toBe(100000);
  });

  it("un prestamo en cero no genera nada", () => {
    expect(totalConInteres(0, 20)).toBe(0);
  });
});

describe("valor de la cuota", () => {
  it("reparte parejo cuando da exacto", () => {
    expect(valorCuota(600000, 20)).toBe(30000);
  });

  it("redondea hacia arriba a la decena: nadie cobra cuotas de 29.999", () => {
    // 599.990 / 20 = 29.999,5  ->  30.000
    expect(valorCuota(599990, 20)).toBe(30000);
    // 100.000 / 3 = 33.333,33  ->  33.340
    expect(valorCuota(100000, 3)).toBe(33340);
  });

  it("sin cuotas o sin total no hay cuota", () => {
    expect(valorCuota(600000, 0)).toBe(0);
    expect(valorCuota(0, 10)).toBe(0);
  });
});

describe("el plan de pagos", () => {
  const base = { total: 600000, cuotas: 20, frecuencia: "DIARIA" as const, desde: "2026-09-01" };

  it("la primera cuota cae un periodo despues, no el mismo dia", () => {
    const plan = planDeCuotas(base);
    expect(plan[0].day).toBe("2026-09-02");
    expect(plan[0].n).toBe(1);
  });

  it("suma exactamente el total, ni un peso mas", () => {
    const plan = planDeCuotas(base);
    expect(plan.reduce((s, c) => s + c.monto, 0)).toBe(600000);
  });

  it("cuadra el sobrante del redondeo en la ultima cuota", () => {
    // 100.000 en 3: 33.340 + 33.340 + 33.320
    const plan = planDeCuotas({ ...base, total: 100000, cuotas: 3 });
    expect(plan.map((c) => c.monto)).toEqual([33340, 33340, 33320]);
    expect(plan.reduce((s, c) => s + c.monto, 0)).toBe(100000);
  });

  it("respeta la frecuencia semanal", () => {
    const plan = planDeCuotas({ ...base, cuotas: 3, frecuencia: "SEMANAL" });
    expect(plan.map((c) => c.day)).toEqual(["2026-09-08", "2026-09-15", "2026-09-22"]);
  });

  it("respeta la quincenal y la mensual", () => {
    const q = planDeCuotas({ ...base, cuotas: 2, frecuencia: "QUINCENAL" });
    expect(q.map((c) => c.day)).toEqual(["2026-09-16", "2026-10-01"]);
    const m = planDeCuotas({ ...base, cuotas: 2, frecuencia: "MENSUAL" });
    expect(m.map((c) => c.day)).toEqual(["2026-10-01", "2026-10-31"]);
  });

  it("un prestamo sin plata no tiene plan", () => {
    expect(planDeCuotas({ ...base, total: 0 })).toEqual([]);
  });
});

describe("como va el prestamo", () => {
  // 600.000 en 20 cuotas diarias de 30.000, prestado el 1 de septiembre.
  const plan = planDeCuotas({
    total: 600000,
    cuotas: 20,
    frecuencia: "DIARIA",
    desde: "2026-09-01",
  });

  it("el dia del prestamo todavia no debe nada", () => {
    const e = estadoPrestamo(plan, 0, "2026-09-01");
    expect(e.exigible).toBe(0);
    expect(e.atraso).toBe(0);
    expect(e.vencidas).toBe(0);
    expect(e.proxima?.n).toBe(1);
  });

  it("al quinto dia debe cinco cuotas", () => {
    const e = estadoPrestamo(plan, 0, "2026-09-06");
    expect(e.vencidas).toBe(5);
    expect(e.exigible).toBe(150000);
    expect(e.atraso).toBe(150000);
    expect(e.cuotasAtrasadas).toBe(5);
  });

  it("si abono todo lo exigible va al dia", () => {
    const e = estadoPrestamo(plan, 150000, "2026-09-06");
    expect(e.atraso).toBe(0);
    expect(e.cuotasAtrasadas).toBe(0);
    expect(e.cuotasPagadas).toBe(5);
    expect(e.proxima?.n).toBe(6);
  });

  it("abonar de mas cubre las siguientes, no queda de sobra", () => {
    const e = estadoPrestamo(plan, 300000, "2026-09-06");
    expect(e.atraso).toBe(0);
    expect(e.cuotasPagadas).toBe(10);
    expect(e.proxima?.n).toBe(11);
  });

  it("dice cuando toca pagar hoy y cuanto", () => {
    const e = estadoPrestamo(plan, 0, "2026-09-10");
    expect(e.tocaHoy).toBe(true);
    expect(e.montoDeHoy).toBe(30000);
  });

  it("un domingo sin cuota no toca pagar", () => {
    const semanal = planDeCuotas({
      total: 300000,
      cuotas: 3,
      frecuencia: "SEMANAL",
      desde: "2026-09-01",
    });
    expect(estadoPrestamo(semanal, 0, "2026-09-09").tocaHoy).toBe(false);
    expect(estadoPrestamo(semanal, 0, "2026-09-08").tocaHoy).toBe(true);
  });

  it("cuando ya pago todo no queda proxima cuota", () => {
    const e = estadoPrestamo(plan, 600000, "2026-09-30");
    expect(e.proxima).toBeNull();
    expect(e.atraso).toBe(0);
    expect(e.cuotasPagadas).toBe(20);
  });
});

describe("distinguir un prestamo de un fiado suelto", () => {
  it("con cuotas y frecuencia es prestamo", () => {
    const d = { amount: 600000, installments: 20, frequency: "DIARIA", day: "2026-09-01" };
    expect(esPrestamo(d)).toBe(true);
    expect(planDeDeuda(d)).toHaveLength(20);
  });

  it("el fiado de la tienda no tiene plan", () => {
    const d = { amount: 20000, installments: null, frequency: null, day: "2026-09-01" };
    expect(esPrestamo(d)).toBe(false);
    expect(planDeDeuda(d)).toEqual([]);
  });

  it("una frecuencia que no existe no arma plan", () => {
    const d = { amount: 600000, installments: 20, frequency: "CADA_LUNA", day: "2026-09-01" };
    expect(esPrestamo(d)).toBe(false);
    expect(planDeDeuda(d)).toEqual([]);
  });
});
