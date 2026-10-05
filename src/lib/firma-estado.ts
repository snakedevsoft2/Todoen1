/** Como se ve el estado de una solicitud de firma en el panel. */
export const ESTADO_FIRMA: Record<string, { label: string; tone: "amber" | "green" | "red" | "blue" }> = {
  PENDIENTE: { label: "Sin firmar", tone: "amber" },
  VISTO: { label: "Lo abrió", tone: "blue" },
  FIRMADO: { label: "Firmado", tone: "green" },
  ANULADO: { label: "Cancelado", tone: "red" },
};

/** "Lo abrio" no es un estado guardado: es una pendiente que el cliente ya vio. */
export function estadoFirma(s: { status: string; viewedAt: Date | null }) {
  return ESTADO_FIRMA[s.status === "PENDIENTE" && s.viewedAt ? "VISTO" : s.status];
}
