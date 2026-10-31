"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/panel/reparto", label: "Planillas" },
  { href: "/panel/reparto/cartera", label: "Cartera" },
  { href: "/panel/reparto/reportes", label: "Reportes" },
  { href: "/panel/reparto/productos", label: "Productos" },
  { href: "/panel/reparto/clientes", label: "Clientes" },
  { href: "/panel/reparto/importar", label: "Importar Excel" },
];

/** Las pestañas de Reparto. Una planilla abierta cuenta como "Planillas". */
export function RepartoNav() {
  const ruta = usePathname();
  const activa = (href: string) =>
    href === "/panel/reparto"
      ? ruta === href || !PESTANAS.slice(1).some((p) => ruta.startsWith(p.href))
      : ruta.startsWith(href);
  return (
    <nav aria-label="Reparto" className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" data-nav-reparto>
      {PESTANAS.map((p) => (
        <Link key={p.href} href={p.href} className={"shrink-0 " + (activa(p.href) ? "btn-primary btn-sm" : "btn-ghost btn-sm")}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
