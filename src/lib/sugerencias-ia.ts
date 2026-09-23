import type { BusinessType } from "@prisma/client";

/**
 * Preguntas para arrancar con la IA Snake, distintas segun lo que hace el
 * negocio. Las usan la pantalla del asistente y el boton flotante.
 */
export const SUGERENCIAS_IA: Record<BusinessType, string[]> = {
  BARBERIA: [
    "¿Cómo voy este mes?",
    "¿Qué corte debería promocionar?",
    "¿Cómo cierro la caja del día?",
    "¿Cómo le mando el recordatorio a un cliente?",
  ],
  ASISTENCIA: [
    "¿Quién no ha marcado entrada hoy?",
    "¿Cuántas horas trabajó el equipo esta semana?",
    "¿Cómo saco la planilla del mes?",
    "¿Cómo le mando el reporte al cliente?",
  ],
  CARTERA: [
    "¿A quién le tengo que cobrar hoy?",
    "¿Quién está atrasado y cuánto debe?",
    "¿Cuánta plata tengo prestada en la calle?",
    "¿Cómo registro un abono y le doy el recibo?",
  ],
  RESTAURANTE: [
    "¿Cómo voy este mes?",
    "¿Qué plato me está dejando más?",
    "¿Cómo cierro una cuenta de mesa?",
    "¿Cómo bajo mis gastos?",
  ],
  COMIDAS_RAPIDAS: [
    "¿Cómo voy este mes?",
    "¿Qué producto me deja más?",
    "¿Cómo registro una venta rápida?",
    "¿Cómo subo mi ticket promedio?",
  ],
  ROPA: [
    "¿Cómo voy este mes?",
    "¿Qué tallas debería reponer?",
    "¿Cómo uso el escáner de código de barras?",
    "¿Cómo cobro un fiado que se venció?",
  ],
  OTRO: [
    "¿Cómo voy este mes?",
    "¿Qué me está dejando más plata?",
    "¿Qué apartados me sirven para mi negocio?",
    "¿Cómo cierro la caja del día?",
  ],
  LAVADERO: [
    "¿Cómo voy este mes?",
    "¿Qué lavador atendió más carros esta semana?",
    "¿Cómo registro un lavado?",
    "¿Cómo le mando el recordatorio a un cliente?",
  ],
};
