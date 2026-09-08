"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { BrandMark } from "./BrandMark";
import type { NavItem } from "@/lib/nav";

export function Shell({
  nav,
  businessName,
  businessLabel,
  ownerName,
  roleLabel,
  staffColor,
  logo,
  bookingUrl,
  logout,
  children,
}: {
  nav: NavItem[];
  businessName: string;
  businessLabel: string;
  /** Nombre de quien entro (el dueno o el barbero). */
  ownerName: string;
  roleLabel?: string;
  staffColor?: string;
  logo?: string | null;
  bookingUrl?: string;
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

  const navList = (
    <nav className="space-y-0.5">
      {nav.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition " +
              (active
                ? "bg-brand-50 text-brand-700"
                : "text-muted hover:bg-surface hover:text-strong")
            }
          >
            <span
              className={
                "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600 transition-opacity " +
                (active ? "opacity-100" : "opacity-0")
              }
            />
            <Icon
              name={item.icon}
              className={"h-[18px] w-[18px] shrink-0 " + (active ? "text-brand-600" : "")}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-3">
      <BrandMark name={businessName} logo={logo} size="md" />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-tight text-strong">{businessName}</p>
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-brand-600">
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
          Ver pagina de reservas
        </Link>
      )}
      {logout}
      <div className="flex items-center gap-2 px-1 pt-1">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: staffColor ?? "currentColor" }}
        />
        <p className="min-w-0 truncate text-[11px] text-subtle">
          {ownerName}
          {roleLabel ? " - " + roleLabel : ""}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra superior, solo en celular */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-panel/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost btn-sm px-2.5"
          aria-label="Abrir menu"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <BrandMark name={businessName} logo={logo} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-strong">{businessName}</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-brand-600">
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
            aria-label="Cerrar menu"
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-[84%] max-w-xs flex-col bg-panel shadow-lift">
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
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch justify-around border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {nav.slice(0, 5).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "flex flex-1 flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[10px] font-medium transition " +
                (active ? "text-brand-600" : "text-muted")
              }
            >
              <Icon name={item.icon} className="h-[18px] w-[18px]" />
              <span className="max-w-full truncate">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
