import type { NavItem, TextosReserva } from "./nav";
import { normalizar } from "./orden-productos";

/**
 * Lo que pidio MB NAILS SPA (Jamundi) para su cuenta y ningun otro negocio
 * tiene. Su cuenta es de barberia (la agenda por persona), pero ahi atienden
 * manicuristas, no barberos.
 *
 * Sus manicuristas (rol BARBERO en la base) no ven el negocio completo: entran
 * con su usuario, sin contraseña, y solo ven SUS citas -el nombre de la
 * clienta, el dia, la hora y el servicio- y su perfil. Ni plata, ni precios,
 * ni telefonos, ni las citas de las demas. En cada cita marcan Llegó, No llegó
 * o Cambiar hora (lo unico que pueden cambiar es el dia y la hora), y cada
 * cosa le llega a la dueña al celular y queda en su Agenda
 * (lib/novedades-cita.ts). Lo pidio el usuario el 24 nov 2026; antes cobraban,
 * vendian y agendaban (commit 27390be).
 *
 * Es el mismo esquema del lavador del lavadero (ver lib/permisos.ts): menu
 * fijo y cualquier otra direccion las devuelve a sus citas.
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

// Una palabra por apartado: el menu de abajo del celular muestra solo la primera.
export const MENU_MANICURISTA: NavItem[] = [
  { href: "/panel/mis-citas", label: "Citas", icon: "calendar" },
  { href: "/panel/perfil", label: "Perfil", icon: "user" },
];

/** Lo que le llega al celular a la dueña de MB Nails (el boton de activarlas). */
export const AVISOS_DUENA_MB =
  "Te avisamos al celular cada cita nueva, cuando una manicurista marca que la clienta llegó, que no llegó o le cambia la hora, y cada venta.";

export function rutaDeManicurista(ruta: string): boolean {
  return MENU_MANICURISTA.some((i) => ruta === i.href || ruta.startsWith(i.href + "/"));
}

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
