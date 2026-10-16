import { describe, expect, it } from "vitest";
import { patioConPendientes, type CambioPatio } from "../src/lib/patio-sin-senal";
import { diaDelTelefono } from "../src/lib/dates";
import type { WashJobRow } from "../src/components/PatioBoard";

/**
 * El patio sin señal: lo que se hizo en el teléfono y todavía no se subió se
 * ve ya hecho en el tablero, en el orden en que se hizo, con las mismas
 * reglas del servidor (lib/lavadero.ts).
 */
const services = [{ id: "s1", name: "Lavado completo", price: 25000 }];
const lavadores = [{ id: "l1", name: "Jhon", color: "#f00" }];
const reservados = [
  { id: "a1", day: "2026-10-15", startTime: "10:00", clientName: "Reservó", clientPhone: "300", serviceId: "s1", serviceName: "Lavado completo" },
];
const ctx = { services, lavadores, reservados, currency: "COP", hoy: "2026-10-15" };

const delServidor: WashJobRow = {
  id: "j1",
  day: "2026-10-15",
  clientName: "Carlos",
  clientPhone: "301",
  vehiclePlate: "ABC-123",
  vehicleType: "carro",
  vehicleColor: null,
  serviceName: "Lavado completo",
  price: 25000,
  status: "LISTO",
  assignedStaffId: "l1",
  assignedStaffName: "Jhon",
  assignedStaffColor: "#f00",
};

let reloj = 0;
const cambio = (accion: string, campos: Record<string, string>): CambioPatio => ({
  accion,
  campos: Object.entries(campos),
  creadoEn: new Date(Date.UTC(2026, 9, 15, 12, 0, reloj++)).toISOString(),
});

describe("el patio con lo que espera señal", () => {
  it("el vehículo recibido sin señal aparece en cola, y se le asigna, termina y cobra", () => {
    const recibir = cambio("recibirVehiculoAction", {
      washJobId: "llave-nueva-1",
      day: "2026-10-15",
      clientName: "Ana",
      clientPhone: "302",
      vehiclePlate: "XYZ-987",
      vehicleType: "moto",
      serviceId: "s1",
      price: "",
    });
    let r = patioConPendientes([], [recibir], ctx);
    expect(r.jobs).toHaveLength(1);
    expect(r.jobs[0]).toMatchObject({
      id: "llave-nueva-1",
      status: "EN_COLA",
      clientName: "Ana",
      serviceName: "Lavado completo",
      price: 25000,
      sinSubir: true,
    });

    const asignar = cambio("asignarLavadorAction", { washJobId: "llave-nueva-1", staffId: "l1" });
    r = patioConPendientes([], [recibir, asignar], ctx);
    expect(r.jobs[0]).toMatchObject({ status: "LAVANDO", assignedStaffName: "Jhon" });

    const listo = cambio("marcarListoAction", { washJobId: "llave-nueva-1" });
    r = patioConPendientes([], [recibir, asignar, listo], ctx);
    expect(r.jobs[0].status).toBe("LISTO");

    const cobrar = cambio("cerrarLavadoAction", { washJobId: "llave-nueva-1", amount: "25000", paymentMethod: "EFECTIVO" });
    // En cualquier orden en que lleguen de la cola, se aplican en el que se hicieron.
    r = patioConPendientes([], [cobrar, listo, recibir, asignar], ctx);
    expect(r.jobs).toHaveLength(0);
  });

  it("el precio escrito a mano manda, con los ceros del lavadero", () => {
    const r = patioConPendientes([], [cambio("recibirVehiculoAction", { washJobId: "k-precio-1", clientName: "B", serviceId: "s1", price: "30" })], ctx);
    expect(r.jobs[0].price).toBe(30000);
  });

  it("dejarlo en pendientes lo pasa a Pendientes con lo que se iba a cobrar", () => {
    const r = patioConPendientes(
      [delServidor],
      [cambio("cerrarLavadoAction", { washJobId: "j1", amount: "20", paymentMethod: "PENDIENTE" })],
      ctx
    );
    expect(r.jobs[0]).toMatchObject({ status: "POR_COBRAR", price: 20000, sinSubir: true });
  });

  it("no hace lo que el servidor tampoco haría", () => {
    const enCola = { ...delServidor, status: "EN_COLA" as const, assignedStaffId: null, assignedStaffName: null };
    const r = patioConPendientes(
      [enCola],
      [
        // No se cobra lo que nadie ha lavado, ni termina lo que no se está lavando.
        cambio("cerrarLavadoAction", { washJobId: "j1", paymentMethod: "EFECTIVO" }),
        cambio("marcarListoAction", { washJobId: "j1" }),
        // Un lavador que no es del equipo no se asigna.
        cambio("asignarLavadorAction", { washJobId: "j1", staffId: "otro" }),
      ],
      ctx
    );
    expect(r.jobs[0]).toMatchObject({ status: "EN_COLA", assignedStaffId: null });
    expect(r.jobs[0].sinSubir).toBeUndefined();
  });

  it("si el servidor ya lo tiene, no lo muestra dos veces", () => {
    const r = patioConPendientes(
      [{ ...delServidor, id: "llave-ya-subida" }],
      [cambio("recibirVehiculoAction", { washJobId: "llave-ya-subida", clientName: "Carlos" })],
      ctx
    );
    expect(r.jobs).toHaveLength(1);
    expect(r.jobs[0].sinSubir).toBeUndefined();
  });

  it("recibir una reserva la quita de Reservados y la pone en cola", () => {
    const r = patioConPendientes(
      [],
      [cambio("recibirDesdeReservaAction", { appointmentId: "a1", washJobId: "llave-reserva-1", day: "2026-10-15" })],
      ctx
    );
    expect([...r.reservasRecibidas]).toEqual(["a1"]);
    expect(r.jobs[0]).toMatchObject({ id: "llave-reserva-1", clientName: "Reservó", status: "EN_COLA", price: 25000 });
  });

  it("borrar, cancelar y cambiar el precio", () => {
    const otro = { ...delServidor, id: "j2" };
    const r = patioConPendientes(
      [delServidor, otro],
      [cambio("cambiarPrecioLavadoAction", { washJobId: "j1", price: "18.000" }), cambio("deleteWashJobAction", { id: "j2" })],
      ctx
    );
    expect(r.jobs.map((j) => j.id)).toEqual(["j1"]);
    expect(r.jobs[0].price).toBe(18000);
    expect(patioConPendientes([delServidor], [cambio("cancelWashJobAction", { id: "j1" })], ctx).jobs).toHaveLength(0);
  });

  it("no toca lo que vino del servidor", () => {
    const original = { ...delServidor };
    patioConPendientes([delServidor], [cambio("cerrarLavadoAction", { washJobId: "j1", paymentMethod: "PENDIENTE" })], ctx);
    expect(delServidor).toEqual(original);
  });
});

describe("el día que dice el teléfono", () => {
  it("acepta hoy y los días de antes dentro del plazo sin señal", () => {
    expect(diaDelTelefono("2026-10-15", "2026-10-15", 15)).toBe("2026-10-15");
    expect(diaDelTelefono("2026-10-14", "2026-10-15", 15)).toBe("2026-10-14");
    expect(diaDelTelefono("2026-09-30", "2026-10-15", 15)).toBe("2026-09-30");
  });

  it("un día que no ha llegado, muy viejo o mal escrito es hoy", () => {
    expect(diaDelTelefono("2026-10-16", "2026-10-15", 15)).toBe("2026-10-15");
    expect(diaDelTelefono("2026-09-29", "2026-10-15", 15)).toBe("2026-10-15");
    expect(diaDelTelefono("ayer", "2026-10-15", 15)).toBe("2026-10-15");
    expect(diaDelTelefono(null, "2026-10-15", 15)).toBe("2026-10-15");
  });
});
