import { db } from "./db";
import { estadoSeguimiento, primerNombre } from "./crm";
import { toInternational, waLink } from "./whatsapp";
import type { SeguimientoRow } from "@/components/Seguimientos";

/**
 * Lo que comparten las pantallas del CRM para armar sus listas.
 *
 * El seguimiento sale igual en la ficha del cliente, en Seguimientos y en el
 * resumen del dia: si cada pantalla lo armara a su manera, el boton de
 * WhatsApp o el permiso de borrar terminarian distintos en cada una.
 */

export type SeguimientoConDatos = {
  id: string;
  title: string;
  dueDay: string;
  dueTime: string | null;
  doneAt: Date | null;
  customerId: string | null;
  staffId: string | null;
  createdById: string | null;
  customer: { name: string; phone: string | null } | null;
  staff: { name: string } | null;
};

export const INCLUIR_SEGUIMIENTO = {
  customer: { select: { name: true, phone: true } },
  staff: { select: { name: true } },
} as const;

export function filaDeSeguimiento(
  s: SeguimientoConDatos,
  ctx: { hoy: string; yoId: string; esDueno: boolean; numeroNegocio: string | null }
): SeguimientoRow {
  const telefono = s.customer?.phone ? toInternational(s.customer.phone, ctx.numeroNegocio) : null;
  return {
    id: s.id,
    title: s.title,
    dueDay: s.dueDay,
    dueTime: s.dueTime,
    hecho: Boolean(s.doneAt),
    estado: estadoSeguimiento(s, ctx.hoy),
    customerId: s.customerId,
    customerName: s.customer?.name ?? null,
    staffName: s.staff?.name ?? null,
    whatsapp:
      telefono && s.customer ? waLink(telefono, "Hola " + primerNombre(s.customer.name) + ", ") : null,
    puedeBorrar: ctx.esDueno || s.staffId === ctx.yoId || s.createdById === ctx.yoId,
  };
}

/**
 * Los seguimientos que le tocan a esta persona.
 *
 * El dueño ve los de todos. Los demás ven los suyos y los que no tienen a
 * nadie asignado, que si nadie los mira se pierden.
 */
export function filtroDeSeguimientos(staff: { id: string; role: string }) {
  return staff.role === "DUENO" ? {} : { OR: [{ staffId: staff.id }, { staffId: null }] };
}

/** La gente activa del equipo, para asignar. */
export function personasDe(userId: string) {
  return db.staff.findMany({
    where: { userId, active: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

/** Los clientes para un selector. */
export function opcionesDeClientes(userId: string) {
  return db.customer.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    take: 1000,
    select: { id: true, name: true },
  });
}

export function iniciales(name: string): string {
  const partes = name.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function textoUltimoContacto(dias: number | null): string {
  if (dias === null) return "Sin contacto";
  if (dias === 0) return "Hablaron hoy";
  if (dias === 1) return "Hablaron ayer";
  return "Hace " + dias + " días";
}
