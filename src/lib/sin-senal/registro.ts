import { createExpenseAction, deleteExpenseAction } from "@/actions/expenses";
import { closeCashAction, reopenCashAction } from "@/actions/cash";
import {
  addOrderItemAction,
  cancelOrderAction,
  changeOrderItemQtyAction,
  closeOrderAction,
  createOrderAction,
  deleteOrderAction,
  removeOrderItemAction,
} from "@/actions/orders";
import {
  closeAppointmentSaleAction,
  createAppointmentAction,
  deleteAppointmentAction,
  setAppointmentStaffAction,
  setAppointmentStatusAction,
  updateAppointmentAction,
} from "@/actions/appointments";
import {
  addPaymentAction,
  cancelDebtAction,
  createDebtAction,
  deleteDebtAction,
  deletePaymentAction,
  markCollectedAction,
  reopenDebtAction,
  updateDueDayAction,
} from "@/actions/debts";
import {
  alternarEtiquetaAction,
  anotarInteraccionAction,
  borrarClienteAction,
  borrarEtiquetaAction,
  borrarInteraccionAction,
  borrarOportunidadAction,
  borrarSeguimientoAction,
  completarSeguimientoAction,
  crearEtiquetaAction,
  crearSeguimientoAction,
  guardarClienteAction,
  guardarOportunidadAction,
} from "@/actions/crm";
import {
  createVariantsBulkAction,
  deleteVariantAction,
  quickStockAction,
  saveVariantAction,
  stockMoveAction,
  toggleVariantAction,
} from "@/actions/inventory";
import { deleteServiceAction, saveServiceAction, toggleServiceAction } from "@/actions/services";
import { deleteSupplierAction, saveSupplierAction, toggleSupplierAction } from "@/actions/suppliers";
import { deleteSaleAction, updateSaleAction, updateSalePaymentAction } from "@/actions/sales";
import {
  asignarLavadorAction,
  cancelWashJobAction,
  cerrarLavadoAction,
  deleteWashJobAction,
  marcarListoAction,
  recibirDesdeReservaAction,
  recibirVehiculoAction,
  updateWashJobAction,
} from "@/actions/lavadero";
import type { EntradaRegistro, Registro } from "./ejecutar";

/**
 * Las acciones del panel que se pueden hacer sin senal.
 *
 * Solo las que no dependen de algo de afuera en el momento: nada que mande un
 * WhatsApp, emita una factura o importe datos. Cada una se ejecuta tal cual,
 * con su propia validacion de sesion y permisos (ver ejecutar.ts).
 */
const estado = (fn: (prev: never, formData: FormData) => Promise<unknown>): EntradaRegistro => ({ kind: "estado", fn });
const simple = (fn: (formData: FormData) => Promise<unknown>): EntradaRegistro => ({ kind: "simple", fn });

export const ACCIONES_SIN_SENAL: Registro = {
  // Gastos y caja
  createExpenseAction: estado(createExpenseAction),
  deleteExpenseAction: simple(deleteExpenseAction),
  closeCashAction: estado(closeCashAction),
  reopenCashAction: simple(reopenCashAction),
  // Cuentas por mesa
  createOrderAction: estado(createOrderAction),
  addOrderItemAction: simple(addOrderItemAction),
  changeOrderItemQtyAction: simple(changeOrderItemQtyAction),
  removeOrderItemAction: simple(removeOrderItemAction),
  closeOrderAction: simple(closeOrderAction),
  cancelOrderAction: simple(cancelOrderAction),
  deleteOrderAction: simple(deleteOrderAction),
  // Turnos
  createAppointmentAction: estado(createAppointmentAction),
  setAppointmentStatusAction: simple(setAppointmentStatusAction),
  updateAppointmentAction: simple(updateAppointmentAction),
  setAppointmentStaffAction: simple(setAppointmentStaffAction),
  deleteAppointmentAction: simple(deleteAppointmentAction),
  closeAppointmentSaleAction: simple(closeAppointmentSaleAction),
  // Cartera
  createDebtAction: estado(createDebtAction),
  addPaymentAction: estado(addPaymentAction),
  updateDueDayAction: estado(updateDueDayAction),
  deletePaymentAction: simple(deletePaymentAction),
  markCollectedAction: simple(markCollectedAction),
  cancelDebtAction: simple(cancelDebtAction),
  reopenDebtAction: simple(reopenDebtAction),
  deleteDebtAction: simple(deleteDebtAction),
  // Clientes
  guardarClienteAction: estado(guardarClienteAction),
  borrarClienteAction: simple(borrarClienteAction),
  crearEtiquetaAction: estado(crearEtiquetaAction),
  alternarEtiquetaAction: simple(alternarEtiquetaAction),
  borrarEtiquetaAction: simple(borrarEtiquetaAction),
  anotarInteraccionAction: estado(anotarInteraccionAction),
  borrarInteraccionAction: simple(borrarInteraccionAction),
  guardarOportunidadAction: estado(guardarOportunidadAction),
  borrarOportunidadAction: simple(borrarOportunidadAction),
  crearSeguimientoAction: estado(crearSeguimientoAction),
  completarSeguimientoAction: simple(completarSeguimientoAction),
  borrarSeguimientoAction: simple(borrarSeguimientoAction),
  // Inventario, productos y proveedores
  saveVariantAction: estado(saveVariantAction),
  createVariantsBulkAction: estado(createVariantsBulkAction),
  stockMoveAction: estado(stockMoveAction),
  quickStockAction: simple(quickStockAction),
  toggleVariantAction: simple(toggleVariantAction),
  deleteVariantAction: simple(deleteVariantAction),
  saveServiceAction: estado(saveServiceAction),
  toggleServiceAction: simple(toggleServiceAction),
  deleteServiceAction: simple(deleteServiceAction),
  saveSupplierAction: estado(saveSupplierAction),
  toggleSupplierAction: simple(toggleSupplierAction),
  deleteSupplierAction: simple(deleteSupplierAction),
  // Ventas ya registradas
  updateSalePaymentAction: simple(updateSalePaymentAction),
  updateSaleAction: simple(updateSaleAction),
  deleteSaleAction: simple(deleteSaleAction),
  // Patio del lavadero
  recibirVehiculoAction: estado(recibirVehiculoAction),
  asignarLavadorAction: simple(asignarLavadorAction),
  marcarListoAction: simple(marcarListoAction),
  cerrarLavadoAction: estado(cerrarLavadoAction),
  cancelWashJobAction: simple(cancelWashJobAction),
  deleteWashJobAction: simple(deleteWashJobAction),
  updateWashJobAction: simple(updateWashJobAction),
  recibirDesdeReservaAction: simple(recibirDesdeReservaAction),
};
