"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { BrandMark } from "./BrandMark";
import { CompartirPortafolio } from "./CompartirPortafolio";
import { InstalarApp } from "./InstalarApp";
import type { NavGroup, NavItem } from "@/lib/nav";
import { initials } from "@/lib/staff";

export function Shell({
  nav,
  navGroups,
  businessName,
  businessLabel,
  ownerName,
  roleLabel,
  staffColor,
  logo,
  bookingUrl,
  bookingLabel = "Ver página de reservas",
  admin = false,
  fotoPerfil = null,
  menuPropio = true,
  compartir,
  instalar = false,
  logout,
  children,
}: {
  nav: NavItem[];
  /** El mismo menu partido por categoria. Si falta, se pinta el de "nav" tal cual. */
  navGroups?: NavGroup[];
  businessName: string;
  businessLabel: string;
  /** Nombre de quien entro (el dueno o el barbero). */
  ownerName: string;
  roleLabel?: string;
  staffColor?: string;
  logo?: string | null;
  bookingUrl?: string;
  /** Como se llama esa pagina publica: reservas en la barberia, catalogo en la ropa. */
  bookingLabel?: string;
  /** Solo para quien administra la plataforma. Para todos los demas no existe. */
  admin?: boolean;
  /** Direccion de la foto de perfil de quien entro, si tiene. */
  fotoPerfil?: string | null;
  /** Si puede armar su propio menu. El empleado del gestor de asistencia no. */
  menuPropio?: boolean;
  /** Para compartir el portafolio con QR y enlace. Solo el dueno. */
  compartir?: { ruta: string; qr: string; negocio: string };
  /** Boton para instalar la aplicacion en el celular. No en la cuenta con funciones limitadas. */
  instalar?: boolean;
  logout: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/panel" ? pathname === "/panel" : pathname.startsWith(href);

  /*
    El apartado donde estas se marca con fondo tenue, el texto y el icono en el
    color de la marca, y una barrita a la izquierda. Antes era un bloque azul
    solido con sombra: se veia desde el otro lado del mostrador, pero con doce
    apartados el menu terminaba gritando mas fuerte que el contenido.
  */
  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={
          "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 " +
          (active
            ? "bg-brand-50 font-semibold text-brand-700"
            : "font-medium text-muted hover:bg-surface hover:text-strong")
        }
      >
        {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand-600" />}
        <Icon
          name={item.icon}
          className={"h-[18px] w-[18px] shrink-0 " + (active ? "text-brand-600" : "text-subtle")}
        />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  // Con categorias: lo fijo va suelto arriba, y el resto se pliega por
  // categoria para no ver una lista larga de una. Sin categorias (el menu fijo
  // del empleado de asistencia o del lavador, que ya es corto) va tal cual.
  const navList = navGroups ? (
    <nav className="space-y-3">
      {navGroups
        .filter((g) => g.pinned)
        .flatMap((g) => g.items)
        .map((item) => renderItem(item))}

      {navGroups
        .filter((g) => !g.pinned)
        .map((g) => {
          const abierta = g.items.some((item) => isActive(item.href));
          return (
            <details key={g.key} open={abierta} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-subtle transition-colors hover:text-strong">
                {g.label}
                <Icon
                  name="chevronDown"
                  className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-open:rotate-180"
                />
              </summary>
              <div className="mt-0.5 space-y-0.5">{g.items.map((item) => renderItem(item))}</div>
            </details>
          );
        })}
    </nav>
  ) : (
    <nav className="space-y-0.5">{nav.map((item) => renderItem(item))}</nav>
  );

  const brand = (
    <div className="flex items-center gap-3">
      <BrandMark name={businessName} logo={logo} size="md" />
      <div className="min-w-0">
        <p className="truncate font-display text-[15px] leading-tight text-strong">
          {businessName}
        </p>
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.04em] text-brand-600">
          {businessLabel}
        </p>
      </div>
    </div>
  );

  const footerLinks = (
    <div className="space-y-2">
      {bookingUrl && (
        <Link href={bookingUrl} target="_blank" className="btn-ghost btn-sm w-full justify-start">
          <Icon name="link" className="h-4 w-4" />
          {bookingLabel}
        </Link>
      )}
      {instalar && <InstalarApp variante="boton" />}
      {compartir && <CompartirPortafolio {...compartir} />}
      {/* Va aqui abajo y no en el menu a proposito: el objetivo de esta
          pantalla es tener menos botones, no uno mas. */}
      {menuPropio && (
        <Link href="/panel/espacio" className="btn-ghost btn-sm w-full justify-start">
          <Icon name="sliders" className="h-4 w-4" />
          Armar mi menú
        </Link>
      )}
      {/* Solo lo ve quien administra la plataforma. Para el resto ni siquiera
          se pinta, asi que nadie descubre que existe. */}
      {admin && (
        <Link href="/admin" className="btn-ghost btn-sm w-full justify-start">
          <Icon name="users" className="h-4 w-4" />
          Panel de la plataforma
        </Link>
      )}
      {logout}
      {/* Quien entro, con su foto: tocarlo lleva a su perfil. */}
      <Link
        href="/panel/perfil"
        data-mi-perfil
        className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors duration-150 hover:bg-surface"
      >
        {fotoPerfil ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoPerfil} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: staffColor ?? "#64748b" }}
            aria-hidden
          >
            {initials(ownerName)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-semibold text-strong">{ownerName}</span>
          <span className="block truncate text-[11px] text-subtle">
            {roleLabel ? roleLabel + " · " : ""}Mi perfil
          </span>
        </span>
      </Link>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra superior, solo en celular */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-panel px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost btn-sm px-2.5"
          aria-label="Abrir menú"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <BrandMark name={businessName} logo={logo} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-display text-sm leading-tight text-strong">{businessName}</p>
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.04em] text-brand-600">
              {businessLabel}
            </p>
          </div>
        </div>
      </header>

      {/* Menu lateral en pantallas grandes */}
      <aside className="hidden w-[264px] shrink-0 border-r border-line bg-panel lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="border-b border-line px-4 py-4">{brand}</div>
        <div className="flex-1 overflow-y-auto px-3 py-4">{navList}</div>
        <div className="border-t border-line px-3 py-3">{footerLinks}</div>
      </aside>

      {/* Menu deslizante en celular */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-[84%] max-w-xs flex-col border-r border-line bg-panel">
            <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-4">
              <div className="min-w-0">{brand}</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-ghost btn-sm px-2"
                aria-label="Cerrar"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">{navList}</div>
            <div className="border-t border-line px-3 py-3">{footerLinks}</div>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      {/* Accesos rapidos abajo, en celular */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch justify-around border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] lg:hidden">
        {nav.slice(0, 5).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "flex flex-1 flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11px] font-medium uppercase tracking-wide transition " +
                (active ? "text-strong" : "text-muted")
              }
            >
              {/* El icono activo va en un cuadro solido con el color del negocio. */}
              <span
                className={
                  "flex h-7 w-9 items-center justify-center rounded-lg border transition " +
                  (active
                    ? "border-transparent bg-brand-600 text-on-brand"
                    : "border-transparent")
                }
              >
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="max-w-full truncate">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
