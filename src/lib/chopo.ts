import { esChopoSnacks, normalizar } from "./orden-productos";

/**
 * La administradora de Chopo Snacks: Juliana Intriago.
 *
 * Lo que el negocio pidio solo para ella (Cuentas por pagar, Mejores clientes)
 * no lo ve nadie mas de la cuenta, ni el dueño si es otra persona, ni los
 * empleados, ni otro negocio. Se reconoce por el nombre con el que esta en el
 * equipo, igual que al negocio por el suyo (ver esChopoSnacks), y da igual si
 * entra como dueña o con usuario de empleado. Si le cambian el nombre en
 * Equipo, deja de verlo.
 */
const ADMIN = ["juliana", "intriago"];

export function esAdminDeChopo(
  user: { businessName: string },
  staff: { name: string; active?: boolean }
): boolean {
  if (!esChopoSnacks(user.businessName) || staff.active === false) return false;
  const palabras = normalizar(staff.name).split(" ");
  return ADMIN.every((p) => palabras.includes(p));
}

/** Lo que va en su menu, ademas de lo de siempre. */
export const MENU_ADMIN_CHOPO = [
  { href: "/panel/por-pagar", label: "Cuentas por pagar", icon: "truck", grupo: "DINERO" as const },
  { href: "/panel/mejores-clientes", label: "Mejores clientes", icon: "trend", grupo: "CRECIMIENTO" as const },
];
