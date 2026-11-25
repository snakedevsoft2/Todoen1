import { describe, expect, it } from "vitest";
import {
  avisoDeCitaNueva,
  avisoDeNovedad,
  cuandoCita,
  lineaDeNovedad,
  queSePuedeMarcar,
  resumenEnPalabras,
  yaEsLaHora,
} from "../src/lib/novedades-cita";

/**
 * Lo que marca la manicurista de MB Nails en sus citas (Llegó, No llegó,
 * Cambiar hora) y lo que le llega a la dueña al celular.
 */
const hoy = "2026-11-24"; // martes

describe("qué puede marcar la manicurista", () => {
  it("hoy: llegó, no llegó y cambiar hora", () => {
    expect(queSePuedeMarcar({ status: "PENDIENTE", day: hoy, startTime: "15:00" }, hoy)).toEqual({ llego: true, noLlego: true, cambiarHora: true });
    expect(queSePuedeMarcar({ status: "CONFIRMADO", day: hoy, startTime: "15:00" }, hoy)).toEqual({ llego: true, noLlego: true, cambiarHora: true });
  });

  it("una cita de otro día solo se cambia de hora", () => {
    expect(queSePuedeMarcar({ status: "PENDIENTE", day: "2026-11-25", startTime: "09:00" }, hoy)).toEqual({ llego: false, noLlego: false, cambiarHora: true });
  });

  it("una de ayer sin marcar todavía se marca", () => {
    expect(queSePuedeMarcar({ status: "PENDIENTE", day: "2026-11-23", startTime: "09:00" }, hoy)).toEqual({ llego: true, noLlego: true, cambiarHora: true });
  });

  it("si no llegó: corregir a 'sí llegó' o cambiarle la hora", () => {
    expect(queSePuedeMarcar({ status: "NO_ASISTIO", day: hoy, startTime: "09:00" }, hoy)).toEqual({ llego: true, noLlego: false, cambiarHora: true });
  });

  it("la que ya llegó, la cobrada y la cancelada no se tocan", () => {
    const nada = { llego: false, noLlego: false, cambiarHora: false };
    expect(queSePuedeMarcar({ status: "ATENDIDO", day: hoy, startTime: "09:00" }, hoy)).toEqual(nada);
    expect(queSePuedeMarcar({ status: "CANCELADO", day: hoy, startTime: "09:00" }, hoy)).toEqual(nada);
    expect(queSePuedeMarcar({ status: "CONFIRMADO", day: hoy, startTime: "09:00", cobrada: true }, hoy)).toEqual(nada);
  });

  it("'no llegó' solo desde la hora de la cita", () => {
    expect(yaEsLaHora({ day: hoy, startTime: "15:00" }, hoy, "14:59")).toBe(false);
    expect(yaEsLaHora({ day: hoy, startTime: "15:00" }, hoy, "15:00")).toBe(true);
    expect(yaEsLaHora({ day: "2026-11-23", startTime: "18:00" }, hoy, "08:00")).toBe(true);
    expect(yaEsLaHora({ day: "2026-11-25", startTime: "08:00" }, hoy, "20:00")).toBe(false);
  });
});

describe("lo que le llega a la dueña", () => {
  const base = { staffName: "Jessica", clientName: "Ana", serviceName: "Semi manos", fromDay: hoy, fromTime: "15:00" };

  it("dice el día como se habla", () => {
    expect(cuandoCita(hoy, "15:00", hoy)).toBe("hoy 3:00 pm");
    expect(cuandoCita("2026-11-25", "09:30", hoy)).toBe("mañana 9:30 am");
    expect(cuandoCita("2026-11-23", "12:00", hoy)).toBe("ayer 12:00 pm");
    expect(cuandoCita("2026-11-27", "16:00", hoy)).toBe("vie 27 nov 4:00 pm");
  });

  it("llegó, no llegó y cambió la hora", () => {
    expect(avisoDeNovedad({ ...base, kind: "LLEGO" }, hoy)).toEqual({
      title: "Ana llegó a su cita",
      body: "hoy 3:00 pm · Semi manos · con Jessica",
    });
    expect(avisoDeNovedad({ ...base, kind: "NO_LLEGO" }, hoy)).toEqual({
      title: "Ana no llegó",
      body: "Cita de hoy 3:00 pm · Semi manos · marcó Jessica",
    });
    expect(avisoDeNovedad({ ...base, kind: "REPROGRAMADA", toDay: "2026-11-25", toTime: "10:00" }, hoy)).toEqual({
      title: "Jessica cambió la cita de Ana",
      body: "Antes hoy 3:00 pm → ahora mañana 10:00 am · Semi manos",
    });
  });

  it("la línea de la Agenda", () => {
    expect(lineaDeNovedad({ ...base, kind: "REPROGRAMADA", toDay: hoy, toTime: "17:00" }, hoy)).toBe(
      "Jessica cambió la cita de Ana: de hoy 3:00 pm a hoy 5:00 pm"
    );
    expect(lineaDeNovedad({ ...base, kind: "NO_LLEGO" }, hoy)).toBe("Jessica marcó que Ana no llegó (cita de hoy 3:00 pm)");
  });

  it("las cuentas en singular y plural", () => {
    expect(resumenEnPalabras({ citas: 2, perdidas: 1, reprogramadas: 1, canceladas: 0 })).toBe(
      "2 citas · 1 no llegó · 1 reprogramada · 0 canceladas"
    );
    expect(resumenEnPalabras({ llegaron: 1, perdidas: 3, reprogramadas: 0 })).toBe("1 llegó · 3 no llegaron · 0 reprogramadas");
  });

  it("cita nueva de la reserva en línea", () => {
    expect(avisoDeCitaNueva({ clientName: "Ana", serviceName: "Semi manos", staffName: "Jessica", day: "2026-11-25", startTime: "10:00" }, hoy)).toEqual({
      title: "Cita nueva: Ana",
      body: "mañana 10:00 am · Semi manos · con Jessica",
      url: "/panel/turnos?d=2026-11-25",
    });
  });
});
