/**
 * Lo que un empleado no puede hacer: borrar ni cambiar lo que ya esta
 * registrado.
 *
 * El empleado agrega (vende, cobra, anota gastos y abonos, crea clientes,
 * mueve inventario, cierra la caja) y todo le queda en su historial. Borrar
 * una venta, cambiarle el pago, anular una deuda o cancelar una cuenta es del
 * dueño, que es quien responde por la plata.
 *
 * La lista se usa en tres sitios, para que no puedan quedar distintos:
 *   - en cada accion del servidor (la regla de verdad);
 *   - en la cola sin señal, que ejecuta las mismas acciones;
 *   - en la pantalla, donde el empleado ni ve esos botones.
 *
 * No usa la base de datos: la importa tambien el navegador.
 */

export const ACCIONES_SOLO_DUENO = new Set<string>([
  "deleteSaleAction",
  "updateSalePaymentAction",
  "updateSaleAction",
  "deleteExpenseAction",
  "reopenCashAction",
  "deletePaymentAction",
  "markCollectedAction",
  "updateDueDayAction",
  "cancelDebtAction",
  "reopenDebtAction",
  "deleteDebtAction",
  "cancelOrderAction",
  "deleteOrderAction",
  "setAppointmentStatusAction",
  "updateAppointmentAction",
  "setAppointmentStaffAction",
  "deleteAppointmentAction",
  "toggleVariantAction",
  "deleteVariantAction",
  "toggleServiceAction",
  "deleteServiceAction",
  "borrarClienteAction",
  "alternarEtiquetaAction",
  "borrarEtiquetaAction",
  "borrarInteraccionAction",
  "borrarOportunidadAction",
  "completarSeguimientoAction",
  "borrarSeguimientoAction",
  "cancelarMensajeAction",
  "borrarDocumentoAction",
  "saveSupplierAction",
  "toggleSupplierAction",
  "deleteSupplierAction",
  "deleteWashJobAction",
  "updateWashJobAction",
  "cambiarPrecioLavadoAction",
  "borrarEntregaAction",
  "anularTicketAction",
]);

/** Las que crean y editan con el mismo formulario: el empleado solo crea (sin id). */
export const ACCIONES_SOLO_CREAR = new Set<string>([
  "guardarClienteAction",
  "saveVariantAction",
  "saveServiceAction",
  "guardarOportunidadAction",
]);

/**
 * Lo que un SUPERVISOR (hoy solo el "jefe de patio" del lavadero) puede hacer
 * aunque este vetado al resto de empleados en ACCIONES_SOLO_DUENO: es "como un
 * pre-admin", puede corregir su propia operacion del dia, pero no todo lo que
 * puede el dueño (equipo, ajustes, reportes siguen sin verlos, eso lo resuelve
 * el sistema de modulos, no esta lista).
 *
 * Corrige pero NO borra: borrar una venta o un vehiculo es solo del dueño.
 * Tampoco cambia la forma de pago de una venta ya registrada (efectivo,
 * transferencia...): la dueña del lavadero pidió que eso quede solo en sus
 * manos, porque es lo que mueve la plata que cuadra en la caja. Al cobrar si
 * elige el pago, igual que cualquier empleado; lo que no puede es cambiarlo
 * despues.
 * Cada cambio que hace un supervisor por esta via queda anotado con
 * anotarActividad() igual que si lo hiciera el dueño, asi que el dueño lo ve
 * despues en Empleados > Auditoria sin que el supervisor sepa que quedo
 * registrado.
 */
export const ACCIONES_SUPERVISOR = new Set<string>([
  "updateSaleAction",
  "updateWashJobAction",
  "cambiarPrecioLavadoAction",
]);

export const SOLO_DUENO = "Solo el dueño del negocio puede borrar o cambiar lo que ya está registrado.";

export function esDueno(role: string | null | undefined): boolean {
  return role === "DUENO";
}

export function esSupervisor(role: string | null | undefined): boolean {
  return role === "SUPERVISOR";
}

/**
 * A quien se le asignan carros en el patio del lavadero: al lavador y tambien
 * al jefe de patio, que en algunos lavaderos lava (Andrea, en el de Fer).
 */
export const ROLES_QUE_LAVAN: ("VENDEDOR" | "SUPERVISOR")[] = ["VENDEDOR", "SUPERVISOR"];

/**
 * Si quien asigna (el dueño o un jefe de patio) le puede asignar un carro a
 * esa persona. Al jefe de patio solo se los asigna otro jefe de patio o el
 * dueño: nadie se asigna carros a si mismo.
 */
export function puedeAsignarleCarro(quien: { id: string; role: string }, lavador: { id: string; role: string }): boolean {
  if (!esDueno(quien.role) && !esSupervisor(quien.role)) return false;
  if (!ROLES_QUE_LAVAN.some((r) => r === lavador.role)) return false;
  return lavador.id !== quien.id;
}

/** Si esta persona puede hacer esa accion con esos campos. */
export function puedeHacer(role: string, accion: string, campos: [string, string][] = []): boolean {
  if (esDueno(role)) return true;
  if (esSupervisor(role) && ACCIONES_SUPERVISOR.has(accion)) return true;
  if (ACCIONES_SOLO_DUENO.has(accion)) return false;
  if (ACCIONES_SOLO_CREAR.has(accion) && campos.some(([k, v]) => k === "id" && v.trim() !== "")) return false;
  return true;
}
