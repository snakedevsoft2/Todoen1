/**
 * Lo que le llega por notificacion a cada quien, dicho corto para el boton de
 * activarlas. null: a esa persona no le llega nada, y no se le ofrece.
 *
 * El dueño recibe todo el negocio. Los empleados solo lo suyo, y solo donde se
 * marca asistencia (lavadero y gestor de asistencia).
 */
export function queRecibe(role: string, businessType: string): string | null {
  if (role === "DUENO") return "Te avisamos al celular cada venta nueva y cada vez que alguien marca entrada o salida.";
  if (!recibeRecordatorioDeMarcar(businessType)) return null;
  if (businessType === "LAVADERO" && role === "VENDEDOR") {
    return "Te avisamos cuando te asignen un carro y cuando te toque marcar entrada o salida.";
  }
  return "Te recordamos cuando te toque marcar tu entrada o tu salida.";
}

/** Los negocios donde el equipo marca asistencia y se le recuerda hacerlo. */
export function recibeRecordatorioDeMarcar(businessType: string): boolean {
  return businessType === "LAVADERO" || businessType === "ASISTENCIA";
}
