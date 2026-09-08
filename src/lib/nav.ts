import type { BusinessType } from "@prisma/client";

export type NavItem = { href: string; label: string; icon: string };

const COMMON_TAIL: NavItem[] = [
  { href: "/panel/ventas", label: "Ventas", icon: "receipt" },
  { href: "/panel/gastos", label: "Gastos", icon: "wallet" },
  { href: "/panel/caja", label: "Cierre de caja", icon: "lock" },
  { href: "/panel/catalogo", label: "Productos y servicios", icon: "tag" },
  { href: "/panel/reportes", label: "Reportes", icon: "chart" },
  { href: "/panel/personalizar", label: "Personalizar", icon: "palette" },
  { href: "/panel/avisos", label: "Avisos", icon: "bell" },
  { href: "/panel/ajustes", label: "Ajustes", icon: "cog" },
];

export function navFor(type: BusinessType): NavItem[] {
  const head: NavItem[] = [{ href: "/panel", label: "Resumen del dia", icon: "home" }];
  if (type === "BARBERIA") {
    return [
      ...head,
      { href: "/panel/turnos", label: "Turnos", icon: "calendar" },
      ...COMMON_TAIL,
    ];
  }
  return [
    ...head,
    { href: "/panel/cuentas", label: "Cuentas abiertas", icon: "table" },
    ...COMMON_TAIL,
  ];
}

export const BUSINESS_LABEL: Record<BusinessType, string> = {
  BARBERIA: "Barberia",
  RESTAURANTE: "Restaurante",
  COMIDAS_RAPIDAS: "Comidas rapidas",
};

export const ITEM_NOUN: Record<BusinessType, { singular: string; plural: string }> = {
  BARBERIA: { singular: "corte / servicio", plural: "cortes y servicios" },
  RESTAURANTE: { singular: "plato / producto", plural: "platos y productos" },
  COMIDAS_RAPIDAS: { singular: "producto", plural: "productos" },
};

/** Direccion publica del logo. Lleva version para poder cachearlo fuerte. */
export function logoUrl(
  slug: string,
  logo: string | null | undefined,
  updatedAt: Date
): string | null {
  if (!logo) return null;
  return "/logo/" + slug + "?v=" + updatedAt.getTime();
}
