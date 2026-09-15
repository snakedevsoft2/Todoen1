import { db } from "./db";

/**
 * Lo que hace cada persona del equipo.
 *
 * Cada venta, cobro, gasto, abono, cliente nuevo, cierre de caja o movimiento
 * de inventario queda anotado con quien lo hizo y cuando; y tambien lo que el
 * dueño borra o cambia. El dueño lo ve en Empleados, persona por persona.
 *
 * Se anota despues de guardar y nunca tumba la accion: si el historial fallara,
 * la venta ya quedo hecha y eso es lo que importa.
 */

export type TipoActividad =
  | "venta"
  | "cobro"
  | "gasto"
  | "abono"
  | "deuda"
  | "cliente"
  | "caja"
  | "inventario"
  | "cuenta"
  | "turno"
  | "producto"
  | "borrado"
  | "cambio";

export const TIPOS_ACTIVIDAD: Record<TipoActividad, { label: string; tone: "slate" | "blue" | "amber" | "red" }> = {
  venta: { label: "Venta", tone: "blue" },
  cobro: { label: "Cobro", tone: "blue" },
  gasto: { label: "Gasto", tone: "amber" },
  abono: { label: "Abono", tone: "blue" },
  deuda: { label: "Por cobrar", tone: "amber" },
  cliente: { label: "Cliente", tone: "slate" },
  caja: { label: "Caja", tone: "slate" },
  inventario: { label: "Inventario", tone: "slate" },
  cuenta: { label: "Cuenta", tone: "slate" },
  turno: { label: "Turno", tone: "slate" },
  producto: { label: "Producto", tone: "slate" },
  borrado: { label: "Borró", tone: "red" },
  cambio: { label: "Cambió", tone: "red" },
};

export function esTipoActividad(v: string): v is TipoActividad {
  return Object.prototype.hasOwnProperty.call(TIPOS_ACTIVIDAD, v);
}

type Quien = { user: { id: string }; staff: { id: string } };

export async function anotarActividad(
  quien: Quien,
  a: { tipo: TipoActividad; detalle: string; monto?: number | null }
): Promise<void> {
  try {
    await db.staffActivity.create({
      data: {
        userId: quien.user.id,
        staffId: quien.staff.id,
        tipo: a.tipo,
        detalle: a.detalle.trim().slice(0, 300),
        monto: a.monto ?? null,
      },
    });
  } catch (e) {
    console.error("No se pudo anotar la actividad", e);
  }
}
