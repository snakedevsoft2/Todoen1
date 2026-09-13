"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

const PESTANAS: { href: string; label: string; corto?: string; icon: string }[] = [
  { href: "/panel/clientes", label: "Clientes", icon: "users" },
  { href: "/panel/clientes/embudo", label: "Embudo", icon: "trend" },
  // "Seguimientos" no cabe en una cuarta parte de un celular.
  { href: "/panel/clientes/seguimientos", label: "Seguimientos", corto: "Pendientes", icon: "check" },
  { href: "/panel/clientes/segmentos", label: "Segmentos", icon: "tag" },
];

/**
 * Las cuatro partes del CRM, como un control segmentado.
 *
 * Van en pestañas y no como cuatro renglones del menu: son un solo apartado
 * visto de cuatro formas, y cuatro renglones mas en el menu estorbarian a quien
 * no los usa. La ficha de un cliente cuenta como "Clientes".
 */
export function CrmTabs({ pendientes }: { pendientes: number }) {
  const pathname = usePathname();
  const activa =
    PESTANAS.slice(1).find((p) => pathname.startsWith(p.href))?.href ?? "/panel/clientes";

  return (
    <nav
      aria-label="Partes del CRM"
      // En celular las cuatro caben a lo ancho con el icono encima: una barra
      // que hay que deslizar para encontrar la ultima pestaña es una pestaña
      // que nadie encuentra.
      className="mb-5 grid grid-cols-4 gap-1 rounded-xl border border-line bg-surface p-1 sm:flex"
    >
      {PESTANAS.map((p) => {
        const on = p.href === activa;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={on ? "page" : undefined}
            className={
              "relative flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[12px] font-semibold transition-all duration-200 ease-suave sm:flex-row sm:gap-2 sm:px-3 sm:py-2 sm:text-sm " +
              (on ? "bg-panel text-strong shadow-card" : "text-muted hover:text-strong")
            }
          >
            <Icon name={p.icon} className="h-4 w-4 shrink-0" />
            <span className="max-w-full truncate sm:hidden">{p.corto ?? p.label}</span>
            <span className="hidden sm:inline">{p.label}</span>
            {p.href === "/panel/clientes/seguimientos" && pendientes > 0 && (
              <span className="absolute right-1 top-0.5 rounded-full bg-bad px-1.5 text-[11px] font-bold leading-5 text-white num sm:static">
                {pendientes > 99 ? "99+" : pendientes}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
