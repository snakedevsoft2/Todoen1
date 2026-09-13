import { addDays, isValidDay } from "./dates";

/**
 * Las novedades del personal: lo que no es un marcaje pero el administrador
 * tiene que saber. Reglas sin base de datos, para usarlas en el telefono y en
 * el servidor por igual.
 */

export type TipoNovedad =
  | "PERMISO"
  | "INCAPACIDAD"
  | "CALAMIDAD"
  | "LLEGADA_TARDE"
  | "SALIDA_TEMPRANO"
  | "VACACIONES"
  | "OTRO";

export const TIPOS_NOVEDAD: { key: TipoNovedad; label: string; hint: string; porHoras: boolean }[] = [
  { key: "PERMISO", label: "Permiso", hint: "Una cita médica, un trámite, una diligencia", porHoras: true },
  { key: "INCAPACIDAD", label: "Incapacidad", hint: "Te incapacitó el médico. Adjunta la foto del soporte", porHoras: false },
  { key: "CALAMIDAD", label: "Calamidad", hint: "Algo grave con tu familia o tu casa", porHoras: false },
  { key: "LLEGADA_TARDE", label: "Llegada tarde", hint: "Vas a llegar después de tu hora", porHoras: true },
  { key: "SALIDA_TEMPRANO", label: "Salida temprano", hint: "Necesitas irte antes de tu hora", porHoras: true },
  { key: "VACACIONES", label: "Vacaciones", hint: "Días de descanso acordados", porHoras: false },
  { key: "OTRO", label: "Otra novedad", hint: "Cualquier otra cosa que el administrador deba saber", porHoras: false },
];

export const ESTADOS_NOVEDAD: Record<string, { label: string; tone: "amber" | "green" | "red" }> = {
  PENDIENTE: { label: "Pendiente", tone: "amber" },
  APROBADA: { label: "Aprobada", tone: "green" },
  RECHAZADA: { label: "Rechazada", tone: "red" },
};

export function esTipoNovedad(v: unknown): v is TipoNovedad {
  return TIPOS_NOVEDAD.some((t) => t.key === v);
}

export function etiquetaNovedad(kind: string): string {
  return TIPOS_NOVEDAD.find((t) => t.key === kind)?.label ?? "Novedad";
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Dias entre dos fechas "YYYY-MM-DD", contando los dos. */
export function diasQueCubre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000) + 1;
}

export function cubreDia(n: { fromDay: string; toDay: string }, dia: string): boolean {
  return n.fromDay <= dia && dia <= n.toDay;
}

export type DatosNovedad = {
  kind: TipoNovedad;
  fromDay: string;
  toDay: string;
  fromTime: string | null;
  toTime: string | null;
  reason: string;
};

export function validarNovedad(
  d: Record<string, unknown>,
  hoy: string
): { ok: true; datos: DatosNovedad } | { ok: false; error: string } {
  const kind = d.kind;
  if (!esTipoNovedad(kind)) return { ok: false, error: "Elige qué tipo de novedad es." };

  const fromDay = typeof d.fromDay === "string" ? d.fromDay : "";
  if (!isValidDay(fromDay)) return { ok: false, error: "Elige desde qué día." };
  const toDay = typeof d.toDay === "string" && d.toDay ? d.toDay : fromDay;
  if (!isValidDay(toDay)) return { ok: false, error: "El último día no es válido." };
  if (toDay < fromDay) return { ok: false, error: "El último día no puede ser antes del primero." };
  if (diasQueCubre(fromDay, toDay) > 90) return { ok: false, error: "Una novedad puede cubrir hasta 90 días." };
  if (fromDay < addDays(hoy, -60)) return { ok: false, error: "Solo se pueden avisar novedades de los últimos 60 días." };

  const fromTime = typeof d.fromTime === "string" && d.fromTime ? d.fromTime : null;
  const toTime = typeof d.toTime === "string" && d.toTime ? d.toTime : null;
  if ((fromTime && !HORA.test(fromTime)) || (toTime && !HORA.test(toTime))) {
    return { ok: false, error: "La hora no es válida." };
  }
  if (fromTime && toTime && toTime <= fromTime) {
    return { ok: false, error: "La hora final debe ser después de la inicial." };
  }

  const reason = typeof d.reason === "string" ? d.reason.trim().slice(0, 1000) : "";
  if (reason.length < 3) return { ok: false, error: "Cuéntale al administrador el motivo." };

  return { ok: true, datos: { kind, fromDay, toDay, fromTime, toTime, reason } };
}
