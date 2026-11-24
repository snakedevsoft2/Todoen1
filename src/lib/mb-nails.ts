import type { NavItem, TextosReserva } from "./nav";
import { normalizar } from "./orden-productos";

/**
 * Lo que pidio MB NAILS SPA (Jamundi) para su cuenta y ningun otro negocio
 * tiene. Su cuenta es de barberia (la agenda por persona), pero ahi atienden
 * manicuristas, no barberos.
 *
 * Sus manicuristas (rol BARBERO en la base) no ven el negocio completo: entran
 * con su usuario y un PIN de 4 numeros que les pone la dueña, y solo ven sus
 * citas, con dos botones -Cerrada (cobra el servicio y lo adicional) y
 * Reprogramada-, la lista de precios sin poder cambiarla y su perfil. Es el
 * mismo esquema del lavador del lavadero (ver lib/permisos.ts): menu fijo y
 * cualquier otra direccion las devuelve a sus citas.
 */

export function esMbNails(nombreNegocio: string | null | undefined): boolean {
  return normalizar(nombreNegocio ?? "") === "mb nails spa";
}

export function esManicuristaDeMbNails(
  user: { businessName?: string | null; businessType: string },
  staff: { role: string }
): boolean {
  return esMbNails(user.businessName) && user.businessType === "BARBERIA" && staff.role !== "DUENO";
}

export const MENU_MANICURISTA: NavItem[] = [
  { href: "/panel/mis-citas", label: "Mis citas", icon: "calendar" },
  { href: "/panel/precios", label: "Precios", icon: "tag" },
  { href: "/panel/perfil", label: "Perfil", icon: "user" },
];

export function rutaDeManicurista(ruta: string): boolean {
  return MENU_MANICURISTA.some((i) => ruta === i.href || ruta.startsWith(i.href + "/"));
}

/** El PIN con el que entra cada manicurista: 4 numeros. */
export const PIN_VALIDO = /^\d{4}$/;

/** Los apartados del menu de la dueña, con las palabras de un spa de uñas. */
export const ETIQUETAS_MENU_MB: Record<string, string> = {
  turnos: "Agenda",
  equipo: "Manicuristas",
  catalogo: "Servicios y precios",
};

/** Quien atiende, en vez de "barbero". */
export const PERSONA_MB = { title: "Manicuristas", singular: "manicurista", plural: "manicuristas" };

/** La reserva en linea de sus clientas. */
export const TEXTOS_RESERVA_MB: TextosReserva = {
  paso1: "1. Elige el servicio",
  paso1Ayuda: "Toca el que quieres hacerte.",
  icono: "sparkle",
  persona: "manicurista",
  personaPlural: "manicuristas",
  notaEjemplo: "Ej: quiero decorado con piedras",
};
