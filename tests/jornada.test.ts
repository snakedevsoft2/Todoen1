import { describe, expect, it } from "vitest";
import { duracionTexto, tramosDe, type MarcaSimple } from "../src/lib/jornada";
import { inicioDelDiaEn } from "../src/lib/dates";

/**
 * Horas trabajadas y limites del dia.
 *
 * Son los numeros que salen en la planilla que se le entrega a un cliente o
 * que se discute en un reclamo laboral. Un error aqui no se ve: simplemente
 * paga horas de mas o de menos.
 */

const m = (kind: "ENTRADA" | "SALIDA", hhmm: string, anulado = false): MarcaSimple => ({
  kind,
  markedAt: new Date("2026-09-13T" + hhmm + ":00Z"),
  voidedAt: anulado ? new Date() : null,
});

const H = 3600000;

describe("horas de una jornada", () => {
  it("entrada y salida dan las horas entre las dos", () => {
    const r = tramosDe([m("ENTRADA", "08:00"), m("SALIDA", "17:00")]);
    expect(r.totalMs).toBe(9 * H);
    expect(r.tramos[0].raro).toBe(false);
  });

  it("dos tramos en el dia se suman", () => {
    const r = tramosDe([
      m("ENTRADA", "08:00"),
      m("SALIDA", "12:00"),
      m("ENTRADA", "13:00"),
      m("SALIDA", "17:30"),
    ]);
    expect(r.totalMs).toBe(8.5 * H);
    expect(r.tramos).toHaveLength(2);
  });

  it("llegan desordenados y se ordenan", () => {
    const r = tramosDe([m("SALIDA", "17:00"), m("ENTRADA", "08:00")]);
    expect(r.totalMs).toBe(9 * H);
  });

  it("lo anulado no cuenta", () => {
    const r = tramosDe([m("ENTRADA", "06:00", true), m("ENTRADA", "08:00"), m("SALIDA", "17:00")]);
    expect(r.totalMs).toBe(9 * H);
    expect(r.tramos.some((t) => t.raro)).toBe(false);
  });

  it("hoy, una entrada sin salida cuenta hasta ahora", () => {
    const r = tramosDe([m("ENTRADA", "08:00")], new Date("2026-09-13T10:30:00Z"));
    expect(r.totalMs).toBe(2.5 * H);
    expect(r.tramos[0].abierto).toBe(true);
    expect(r.tramos[0].raro).toBe(false);
  });

  it("un dia pasado sin salida NO inventa horas y queda senalado", () => {
    const r = tramosDe([m("ENTRADA", "08:00")], null);
    expect(r.totalMs).toBe(0);
    expect(r.tramos[0].raro).toBe(true);
  });

  it("una salida sin entrada no suma y queda senalada", () => {
    const r = tramosDe([m("SALIDA", "17:00")]);
    expect(r.totalMs).toBe(0);
    expect(r.tramos[0].raro).toBe(true);
  });

  it("dos entradas seguidas: la primera no cierra sola", () => {
    const r = tramosDe([m("ENTRADA", "08:00"), m("ENTRADA", "08:05"), m("SALIDA", "17:05")]);
    expect(r.totalMs).toBe(9 * H);
    expect(r.tramos.filter((t) => t.raro)).toHaveLength(1);
  });

  it("sin marcajes no hay horas", () => {
    expect(tramosDe([]).totalMs).toBe(0);
  });
});

describe("como se escribe la duracion", () => {
  it("horas y minutos", () => {
    expect(duracionTexto(8.5 * H)).toBe("8 h 30 min");
    expect(duracionTexto(9 * H)).toBe("9 h");
    expect(duracionTexto(45 * 60000)).toBe("45 min");
    expect(duracionTexto(0)).toBe("0 min");
  });
});

describe("donde empieza el dia en la zona del negocio", () => {
  it("en Bogota el dia empieza a las 5 de la manana UTC", () => {
    expect(inicioDelDiaEn("2026-09-13", "America/Bogota").toISOString()).toBe(
      "2026-09-13T05:00:00.000Z"
    );
  });

  it("en UTC empieza a medianoche", () => {
    expect(inicioDelDiaEn("2026-09-13", "UTC").toISOString()).toBe("2026-09-13T00:00:00.000Z");
  });

  it("respeta el horario de verano: Madrid en julio va dos horas adelante", () => {
    expect(inicioDelDiaEn("2026-07-01", "Europe/Madrid").toISOString()).toBe(
      "2026-06-30T22:00:00.000Z"
    );
  });

  it("y el dia del cambio de hora la medianoche todavia es la del invierno", () => {
    expect(inicioDelDiaEn("2026-03-29", "Europe/Madrid").toISOString()).toBe(
      "2026-03-28T23:00:00.000Z"
    );
  });
});
