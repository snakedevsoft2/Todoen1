import type { BusinessType } from "@prisma/client";

/**
 * Instructivo de bienvenida.
 *
 * Corto a proposito: cinco pasos, uno por pantalla, con la accion concreta que
 * la persona va a hacer el primer dia. Cada negocio ve el suyo, porque el
 * primer dia de una barberia no se parece en nada al de una tienda de ropa.
 *
 * Vive aparte de las acciones porque lo lee un componente del navegador.
 */
export type TourStep = {
  icon: string;
  title: string;
  text: string;
  /** A donde lleva el boton, si el paso invita a hacer algo. */
  href?: string;
  action?: string;
};

const COMUNES: TourStep[] = [
  {
    icon: "receipt",
    title: "Registra la venta en dos toques",
    text: "Tocas lo que vendiste, eliges como te pagaron y listo. Queda sumado al dia al instante, y puedes mandarle la factura al cliente por WhatsApp.",
    href: "/panel/ventas",
    action: "Ver ventas",
  },
  {
    icon: "wallet",
    title: "Anota lo que sale de la caja",
    text: "Cada gasto que anotes se descuenta de lo vendido, para que veas cuanto te queda limpio de verdad y no solo cuanto entro.",
    href: "/panel/gastos",
    action: "Ver gastos",
  },
  {
    icon: "lock",
    title: "Cierra el dia sin cuadernos",
    text: "Al final del dia comparas la plata que contaste con la que registro la aplicacion. Si hay diferencia, te la muestra.",
    href: "/panel/caja",
    action: "Ver cierre de caja",
  },
];

const FINAL: TourStep = {
  icon: "whatsapp",
  title: "Si te trabas, escribenos",
  text: "En Soporte tienes el WhatsApp directo. No hay pregunta boba: preferimos que preguntes a que dejes de usarlo.",
  href: "/panel/soporte",
  action: "Ver soporte",
};

const PRIMERO: Record<BusinessType, TourStep> = {
  CARTERA: {
    icon: "handshake",
    title: "Tus prestamos y a quien le toca hoy",
    text: "Anotas cuanto prestaste, el interes y en cuantas cuotas. La aplicacion arma el plan de pagos, te dice a quien le toca pagar hoy y quien se atraso, y le entregas el recibo de cada abono.",
    href: "/panel/cartera",
    action: "Ver cuentas por cobrar",
  },
  BARBERIA: {
    icon: "calendar",
    title: "Tus clientes separan el turno solos",
    text: "Tienes un enlace propio para compartir por WhatsApp. El cliente elige el dia, la hora libre y el corte, y a ti te aparece en la agenda con su nombre y su telefono.",
    href: "/panel/turnos",
    action: "Ver los turnos",
  },
  RESTAURANTE: {
    icon: "table",
    title: "Una cuenta por cada mesa",
    text: "Abres la cuenta cuando llega el cliente, le vas cargando los platos y la cierras cuando paga. Ahi mismo se convierte en la venta del dia.",
    href: "/panel/cuentas",
    action: "Ver cuentas",
  },
  COMIDAS_RAPIDAS: {
    icon: "table",
    title: "Cuentas rapidas o venta al mostrador",
    text: "Abre una cuenta para el domicilio o cobra directo en el mostrador. Como te sirva mas rapido segun el momento.",
    href: "/panel/cuentas",
    action: "Ver cuentas",
  },
  ROPA: {
    icon: "box",
    title: "Tu ropa contada por talla y color",
    text: "Cada prenda lleva sus tallas con su stock. Al vender se descuenta sola, y te avisa cuando una talla se esta acabando. Puedes escanear el codigo de barras con la camara.",
    href: "/panel/inventario",
    action: "Ver inventario",
  },
  // "Otro" no tiene un apartado propio del oficio, porque no sabemos cual es.
  // Lo que si sabemos es que le entregamos casi todo, asi que el paso que de
  // verdad le sirve es aprender a quitarse de encima lo que no usa.
  OTRO: {
    icon: "sliders",
    title: "Deja solo lo que uses",
    text: "Como no sabemos a que te dedicas, te dimos casi todo. Entra a Armar mi menu y apaga lo que no necesites: no se borra nada y lo puedes volver a prender cuando quieras.",
    href: "/panel/espacio",
    action: "Armar mi menu",
  },
};

const SEGUNDO: Record<BusinessType, TourStep> = {
  CARTERA: {
    icon: "wallet",
    title: "Cuadra lo que recogiste",
    text: "Al final del dia, Caja te dice cuanto recogiste de todos los cobros y lo comparas con la plata que tienes en mano. Si no cuadra, te muestra la diferencia.",
    href: "/panel/caja",
    action: "Ver la caja",
  },
  BARBERIA: {
    icon: "tag",
    title: "Primero, tus cortes y sus precios",
    text: "Te dejamos unos de ejemplo para que arranques. Cambialos por los tuyos con su precio y su duracion: eso es lo que ve el cliente al reservar.",
    href: "/panel/catalogo",
    action: "Ver mis servicios",
  },
  RESTAURANTE: {
    icon: "tag",
    title: "Primero, tu carta",
    text: "Te dejamos unos platos de ejemplo. Cambialos por los tuyos con su precio y ya puedes empezar a cargar cuentas.",
    href: "/panel/catalogo",
    action: "Ver mi carta",
  },
  COMIDAS_RAPIDAS: {
    icon: "tag",
    title: "Primero, tus productos",
    text: "Te dejamos unos de ejemplo. Cambialos por los tuyos con su precio y ya puedes empezar a vender.",
    href: "/panel/catalogo",
    action: "Ver mis productos",
  },
  ROPA: {
    icon: "shirt",
    title: "Primero, sube tus prendas",
    text: "Con su foto, su precio y sus tallas. Puedes crear S, M, L y XL de una sola vez, y la prenda sale publicada en tu catalogo con un enlace para compartir.",
    href: "/panel/catalogo",
    action: "Ver mis prendas",
  },
  OTRO: {
    icon: "tag",
    title: "Primero, lo que vendes y a como",
    text: "Sea producto o servicio, ponlo con su precio. Te dejamos dos de ejemplo para que veas como es: cambialos por los tuyos. Si manejas existencias, marca la casilla de inventario y le llevas la cuenta.",
    href: "/panel/catalogo",
    action: "Ver mi lista",
  },
};

/** Los pasos que le tocan a este negocio, en orden. */
export function tourSteps(type: BusinessType): TourStep[] {
  return [SEGUNDO[type], PRIMERO[type], ...COMUNES, FINAL];
}
