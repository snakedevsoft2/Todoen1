import type { BusinessType } from "@prisma/client";

/**
 * Nombres y direcciones publicas del negocio.
 *
 * El menu ya no vive aqui: vive en la base de datos y lo arma src/lib/modules.ts.
 * Lo que queda en este archivo es lo que no depende de quien entro, sino del
 * negocio: como se llama cada oficio, como se llama lo que vende, y donde
 * queda su pagina publica.
 */

export type NavItem = { href: string; label: string; icon: string };

/**
 * El menu lateral agrupado por categoria, para no verlo todo de un tiron.
 *
 * `pin` dice si el grupo va suelto (sin plegar) y donde: "arriba" es lo que se
 * abre todo el dia (el resumen), "abajo" es lo que se busca de vez en cuando y
 * no debe estorbar arriba (ajustes y soporte). `null` = categoria plegable.
 */
export type NavGroup = {
  key: string;
  label: string;
  items: NavItem[];
  pin: "arriba" | "abajo" | null;
};

export const BUSINESS_LABEL: Record<BusinessType, string> = {
  BARBERIA: "Barbería",
  RESTAURANTE: "Restaurante",
  COMIDAS_RAPIDAS: "Comidas rápidas",
  ROPA: "Tienda de ropa",
  CARTERA: "Cartera y cobranza",
  ASISTENCIA: "Gestor de asistencia",
  OTRO: "Otro negocio",
  LAVADERO: "Lavadero de carros",
};

export const ITEM_NOUN: Record<BusinessType, { singular: string; plural: string }> = {
  BARBERIA: { singular: "corte / servicio", plural: "cortes y servicios" },
  RESTAURANTE: { singular: "plato / producto", plural: "platos y productos" },
  COMIDAS_RAPIDAS: { singular: "producto", plural: "productos" },
  ROPA: { singular: "prenda", plural: "prendas" },
  // No vende cosas: lo que "maneja" son prestamos. Igual necesita el par,
  // porque hay pantallas comunes que lo piden.
  CARTERA: { singular: "prestamo", plural: "prestamos" },
  // Tampoco vende nada. Lo que administra son jornadas de trabajo.
  ASISTENCIA: { singular: "servicio", plural: "servicios" },
  // Sirve para cualquier oficio, asi que no se casa con ninguno.
  OTRO: { singular: "producto / servicio", plural: "productos y servicios" },
  LAVADERO: { singular: "lavado / servicio", plural: "lavados y servicios" },
};

/**
 * El portafolio publico. Lo tienen los cuatro negocios: es la pagina que se
 * comparte por enlace o por QR para que el cliente vea y pida.
 */
export function publicPath(_type: BusinessType, slug: string): string {
  return "/catalogo/" + slug;
}

/** La agenda por hora, de la barberia y el lavadero. */
export function bookingPath(type: BusinessType, slug: string): string | null {
  return type === "BARBERIA" || type === "LAVADERO" ? "/reservar/" + slug : null;
}

/**
 * Direccion publica del logo. Lleva version para poder cachearlo fuerte.
 *
 * El segundo parametro es solo "hay logo o no": nunca se usa el contenido. Por
 * eso acepta un booleano ademas del data URL, y quien arma un listado debe
 * pasar el booleano — traer el base64 de la base de datos para despues botarlo
 * es justo lo que hacia que una pagina de catalogo moviera megas por visita.
 * Ver lib/imagenes.ts.
 */
export function logoUrl(
  slug: string,
  logo: string | boolean | null | undefined,
  updatedAt: Date
): string | null {
  if (!logo) return null;
  return "/logo/" + slug + "?v=" + updatedAt.getTime();
}

/** Direccion de la portada del portafolio. Misma idea que el logo. */
export function coverUrl(
  slug: string,
  cover: string | boolean | null | undefined,
  updatedAt: Date
): string | null {
  if (!cover) return null;
  return "/portada/" + slug + "?v=" + updatedAt.getTime();
}

/** Direccion de la foto de una prenda. Misma idea (y misma advertencia) que el logo. */
export function photoUrl(
  serviceId: string,
  image: string | boolean | null | undefined,
  updatedAt: Date
): string | null {
  if (!image) return null;
  return "/foto/" + serviceId + "?v=" + updatedAt.getTime();
}
