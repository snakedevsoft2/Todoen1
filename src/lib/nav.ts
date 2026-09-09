import type { BusinessType } from "@prisma/client";

export type NavItem = { href: string; label: string; icon: string };

/** Lo que ve todo el mundo, dueno o barbero. */
const COMMON_TAIL: NavItem[] = [
  { href: "/panel/ventas", label: "Ventas", icon: "receipt" },
  { href: "/panel/gastos", label: "Gastos", icon: "wallet" },
  { href: "/panel/cartera", label: "Cartera", icon: "handshake" },
  { href: "/panel/caja", label: "Cierre de caja", icon: "lock" },
  { href: "/panel/catalogo", label: "Productos y servicios", icon: "tag" },
  { href: "/panel/reportes", label: "Reportes", icon: "chart" },
  { href: "/panel/asistente", label: "Asistente", icon: "sparkle" },
];

/** Configuracion del negocio: solo el dueno. */
const OWNER_TAIL: NavItem[] = [
  { href: "/panel/portafolio", label: "Mi portafolio", icon: "image" },
  { href: "/panel/personalizar", label: "Personalizar", icon: "palette" },
  { href: "/panel/avisos", label: "Avisos", icon: "bell" },
];

/**
 * Menu segun el tipo de negocio y quien entro.
 *
 * El barbero ve el movimiento del negocio (turnos, ventas, gastos, reportes)
 * pero no la configuracion: ni marca, ni avisos, ni el equipo.
 */
export function navFor(type: BusinessType, role: string = "DUENO"): NavItem[] {
  const owner = role === "DUENO";
  const head: NavItem[] = [{ href: "/panel", label: "Resumen del dia", icon: "home" }];

  const middle: NavItem[] =
    type === "BARBERIA"
      ? [
          { href: "/panel/turnos", label: "Turnos", icon: "calendar" },
          ...(owner ? [{ href: "/panel/equipo", label: "Barberos", icon: "users" }] : []),
        ]
      : type === "ROPA"
        ? [
            { href: "/panel/inventario", label: "Inventario", icon: "box" },
            ...(owner
              ? [
                  { href: "/panel/proveedores", label: "Proveedores", icon: "truck" },
                  { href: "/panel/equipo", label: "Empleados", icon: "users" },
                ]
              : []),
          ]
        : [{ href: "/panel/cuentas", label: "Cuentas abiertas", icon: "table" }];

  return [
    ...head,
    ...middle,
    ...COMMON_TAIL,
    ...(owner ? OWNER_TAIL : []),
    { href: "/panel/ajustes", label: "Ajustes", icon: "cog" },
    // El soporte va de ultimo y lo ve todo el mundo, dueno o empleado.
    { href: "/panel/soporte", label: "Soporte", icon: "whatsapp" },
  ];
}

export const BUSINESS_LABEL: Record<BusinessType, string> = {
  BARBERIA: "Barberia",
  RESTAURANTE: "Restaurante",
  COMIDAS_RAPIDAS: "Comidas rapidas",
  ROPA: "Tienda de ropa",
};

export const ITEM_NOUN: Record<BusinessType, { singular: string; plural: string }> = {
  BARBERIA: { singular: "corte / servicio", plural: "cortes y servicios" },
  RESTAURANTE: { singular: "plato / producto", plural: "platos y productos" },
  COMIDAS_RAPIDAS: { singular: "producto", plural: "productos" },
  ROPA: { singular: "prenda", plural: "prendas" },
};

/**
 * El portafolio publico. Lo tienen los cuatro negocios: es la pagina que se
 * comparte por enlace o por QR para que el cliente vea y pida.
 */
export function publicPath(_type: BusinessType, slug: string): string {
  return "/catalogo/" + slug;
}

/** La agenda por hora, que es solo de la barberia. */
export function bookingPath(type: BusinessType, slug: string): string | null {
  return type === "BARBERIA" ? "/reservar/" + slug : null;
}

/** Direccion publica del logo. Lleva version para poder cachearlo fuerte. */
export function logoUrl(
  slug: string,
  logo: string | null | undefined,
  updatedAt: Date
): string | null {
  if (!logo) return null;
  return "/logo/" + slug + "?v=" + updatedAt.getTime();
}

/** Direccion de la foto de una prenda. Misma idea que el logo. */
export function photoUrl(
  serviceId: string,
  image: string | null | undefined,
  updatedAt: Date
): string | null {
  if (!image) return null;
  return "/foto/" + serviceId + "?v=" + updatedAt.getTime();
}
