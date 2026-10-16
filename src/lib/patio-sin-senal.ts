import type { ReservaPatio, ServiceOption, StaffOption, WashJobRow } from "@/components/PatioBoard";
import { cerosPara, parseMoney } from "./format";

/**
 * El patio como queda despues de lo que se hizo sin senal.
 *
 * Sin senal, recibir un vehiculo, asignarle lavador, marcarlo listo o cobrarlo
 * queda en la cola del telefono (ver components/SinSenal). Sin esto el
 * tablero seguia mostrando lo ultimo que dijo el servidor: el vehiculo recien
 * recibido no aparecia y no se le podia asignar lavador ni cobrar hasta que
 * volviera la senal.
 *
 * Aqui se aplican esos cambios, en el orden en que se hicieron, sobre lo que
 * vino del servidor, con las mismas reglas de lib/lavadero.ts. Lo que se ve
 * asi lleva `sinSubir`. Cuando la senal vuelve se ejecutan las acciones de
 * verdad, y el vehiculo creado sin senal conserva la llave que se le puso
 * aqui (ver crearWashJob), asi que las que siguen le caen al mismo.
 */

export type CambioPatio = { accion: string; campos: [string, string][]; creadoEn: string };

type Contexto = {
  services: ServiceOption[];
  lavadores: StaffOption[];
  reservados: ReservaPatio[];
  currency: string;
  hoy: string;
};

export function patioConPendientes(
  jobs: WashJobRow[],
  cambios: CambioPatio[],
  ctx: Contexto
): { jobs: WashJobRow[]; reservasRecibidas: Set<string> } {
  const filas = new Map(jobs.map((j) => [j.id, { ...j }]));
  const reservasRecibidas = new Set<string>();
  const ceros = cerosPara("LAVADERO");

  const nuevo = (id: string, datos: Partial<WashJobRow> & { serviceId?: string | null; precio?: string }) => {
    const servicio = ctx.services.find((s) => s.id === datos.serviceId);
    filas.set(id, {
      id,
      day: datos.day || ctx.hoy,
      clientName: datos.clientName ?? "",
      clientPhone: datos.clientPhone ?? "",
      vehiclePlate: datos.vehiclePlate || null,
      vehicleType: datos.vehicleType || null,
      vehicleColor: datos.vehicleColor || null,
      serviceName: servicio?.name ?? datos.serviceName ?? "Lavado",
      price: datos.precio ? parseMoney(datos.precio, ctx.currency, ceros) : (servicio?.price ?? 0),
      status: "EN_COLA",
      assignedStaffId: null,
      assignedStaffName: null,
      assignedStaffColor: null,
      sinSubir: true,
    });
  };

  const enOrden = [...cambios].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  for (const c of enOrden) {
    const campo = (k: string) => c.campos.find(([n]) => n === k)?.[1] ?? "";
    const fila = filas.get(campo("washJobId"));

    switch (c.accion) {
      case "recibirVehiculoAction": {
        const id = campo("washJobId");
        // Sin llave no hay como seguirle la pista; si ya esta, ya se subio.
        if (!id || filas.has(id)) break;
        nuevo(id, {
          day: campo("day"),
          clientName: campo("clientName"),
          clientPhone: campo("clientPhone"),
          vehiclePlate: campo("vehiclePlate"),
          vehicleType: campo("vehicleType"),
          vehicleColor: campo("vehicleColor"),
          serviceId: campo("serviceId") || null,
          precio: campo("price"),
        });
        break;
      }
      case "recibirDesdeReservaAction": {
        const cita = ctx.reservados.find((r) => r.id === campo("appointmentId"));
        if (!cita) break;
        reservasRecibidas.add(cita.id);
        const id = campo("washJobId");
        if (!id || filas.has(id)) break;
        nuevo(id, {
          day: campo("day"),
          clientName: cita.clientName,
          clientPhone: cita.clientPhone,
          serviceId: cita.serviceId,
          serviceName: cita.serviceName,
        });
        break;
      }
      case "asignarLavadorAction": {
        const lavador = ctx.lavadores.find((l) => l.id === campo("staffId"));
        if (!fila || !lavador || (fila.status !== "EN_COLA" && fila.status !== "LAVANDO")) break;
        Object.assign(fila, {
          status: "LAVANDO",
          assignedStaffId: lavador.id,
          assignedStaffName: lavador.name,
          assignedStaffColor: lavador.color,
          sinSubir: true,
        });
        break;
      }
      case "marcarListoAction": {
        if (fila?.status === "LAVANDO") Object.assign(fila, { status: "LISTO", sinSubir: true });
        break;
      }
      case "cerrarLavadoAction": {
        if (!fila || fila.status === "EN_COLA") break;
        const monto = campo("amount");
        const cobrado = monto ? parseMoney(monto, ctx.currency, ceros) : fila.price;
        if (campo("paymentMethod") === "PENDIENTE") {
          if (fila.status === "LAVANDO" || fila.status === "LISTO") {
            Object.assign(fila, { status: "POR_COBRAR", price: cobrado, sinSubir: true });
          }
        } else {
          // Cobrado: el vehiculo se entrego y sale del patio.
          filas.delete(fila.id);
        }
        break;
      }
      case "cancelWashJobAction":
      case "deleteWashJobAction": {
        filas.delete(campo("id"));
        break;
      }
      case "cambiarPrecioLavadoAction": {
        const precio = parseMoney(campo("price"), ctx.currency, ceros);
        if (fila && precio > 0) Object.assign(fila, { price: precio, sinSubir: true });
        break;
      }
    }
  }

  return { jobs: [...filas.values()], reservasRecibidas };
}
