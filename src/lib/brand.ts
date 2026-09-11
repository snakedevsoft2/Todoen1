/**
 * La marca de la aplicacion.
 *
 * Vive en un solo sitio para que cambiarla no sea una caceria por todo el
 * proyecto. Ojo: esto es la marca de la aplicacion, no la del negocio que la
 * usa; esa la elige cada dueno en Personalizar.
 */
export const APP_NAME = "Todoen1";

/** Como se escribe cuando hay que gritarla. */
export const APP_NAME_UPPER = "TODOEN1";

export const APP_TAGLINE = "Ventas, inventario y caja de tu negocio";

/**
 * El logo, en dos recortes del mismo dibujo.
 *
 * `APP_LOGO_ICON` es el cuadrado ajustado: sirve para cualquier caja chica,
 * y es el mismo archivo del icono de la pestana. `APP_LOGO_WIDE` es el
 * original con su margen, para cuando el logo va suelto y con aire.
 */
export const APP_LOGO_ICON = "/LOGO/logo-icono.png";
export const APP_LOGO_WIDE = "/LOGO/logo.png";

/**
 * Los negocios para los que sirve, con lo que hace por cada uno.
 *
 * Se usa en el ingreso y en el inicio: es la forma mas rapida de que alguien
 * entienda si la aplicacion es para el sin leer un parrafo.
 */
export type NegocioDemo = {
  key: string;
  label: string;
  icon: string;
  color: string;
  titular: string;
  stat: string;
  detalle: string;
  puntos: string[];
};

export const NEGOCIOS: NegocioDemo[] = [
  {
    key: "BARBERIA",
    label: "Barberia",
    icon: "scissors",
    color: "#4f46e5",
    titular: "Tus clientes separan el turno solos",
    stat: "12 turnos hoy",
    detalle: "9 atendidos - $ 340.000",
    puntos: ["Agenda por barbero", "Enlace propio de reservas", "Aviso por WhatsApp"],
  },
  {
    key: "RESTAURANTE",
    label: "Restaurante",
    icon: "table",
    color: "#b91c1c",
    titular: "Una cuenta por cada mesa",
    stat: "6 mesas abiertas",
    detalle: "Sin cobrar $ 285.000",
    puntos: ["Cuentas por mesa", "Se cierra y se vuelve venta", "Cierre de caja del dia"],
  },
  {
    key: "COMIDAS_RAPIDAS",
    label: "Comidas rapidas",
    icon: "receipt",
    color: "#ea580c",
    titular: "Cobra en dos toques",
    stat: "$ 780.000 hoy",
    detalle: "38 ventas - ticket $ 20.500",
    puntos: ["Venta al mostrador", "Gastos del dia", "Cuanto te queda limpio"],
  },
  {
    key: "ROPA",
    label: "Tienda de ropa",
    icon: "shirt",
    color: "#0f766e",
    titular: "Tu ropa contada por talla",
    stat: "146 prendas",
    detalle: "3 tallas por acabarse",
    puntos: ["Inventario por talla y color", "Escanea el codigo de barras", "Catalogo con fotos"],
  },
];
