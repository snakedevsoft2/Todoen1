"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import type { NavItem } from "@/lib/nav";

export function Shell({
  nav,
  businessName,
  businessLabel,
  ownerName,
  bookingUrl,
  logout,
  children,
}: {
  nav: NavItem[];
  businessName: string;
  businessLabel: string;
  ownerName: string;
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
    <nav className="space-y-1">
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition " +
            (isActive(item.href)
              ? "bg-brand-500/15 text-brand-200 ring-1 ring-brand-500/30"
              : "text-slate-300 hover:bg-white/5 hover:text-white")
          }
        >
          <Icon name={item.icon} className="h-5 w-5 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </nav>
  );

  const brand = (
    <div className="mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-300">
        {businessLabel}
      </p>
      <p className="truncate text-lg font-bold text-white">{businessName}</p>
      <p className="truncate text-xs text-slate-400">{ownerName}</p>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra superior solo en movil */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost btn-sm"
          aria-label="Abrir menu"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-white">{businessName}</p>
          <p className="text-[10px] uppercase tracking-widest text-brand-300">{businessLabel}</p>
        </div>
        <div className="w-10" />
      </header>

      {/* Sidebar escritorio */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-panel/60 p-4 lg:sticky lg:top-0 lg:block lg:h-dvh lg:overflow-y-auto">
        {brand}
        {navList}
        <div className="mt-6 space-y-2 border-t border-line pt-4">
          {bookingUrl && (
            <Link href={bookingUrl} target="_blank" className="btn-ghost btn-sm w-full">
              <Icon name="link" className="h-4 w-4" />
              Ver pagina de reservas
            </Link>
          )}
          {logout}
        </div>
      </aside>

      {/* Drawer movil */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menu"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[82%] max-w-xs overflow-y-auto border-r border-line bg-panel p-4 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div className="min-w-0">{brand}</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-ghost btn-sm"
                aria-label="Cerrar"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
            {navList}
            <div className="mt-6 space-y-2 border-t border-line pt-4">
              {bookingUrl && (
                <Link href={bookingUrl} target="_blank" className="btn-ghost btn-sm w-full">
                  <Icon name="link" className="h-4 w-4" />
                  Ver pagina de reservas
                </Link>
              )}
              {logout}
            </div>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      {/* Navegacion inferior movil con los accesos mas usados */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch justify-around border-t border-line bg-ink/95 backdrop-blur lg:hidden">
        {nav.slice(0, 5).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              "flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition " +
              (isActive(item.href) ? "text-brand-300" : "text-slate-400")
            }
          >
            <Icon name={item.icon} className="h-5 w-5" />
            <span className="max-w-full truncate">{item.label.split(" ")[0]}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
