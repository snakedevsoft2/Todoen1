import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { logoutAction } from "@/actions/auth";
import { Icon } from "@/components/Icon";

/**
 * El panel de la plataforma.
 *
 * A proposito no usa el Shell del negocio ni el color de nadie: se ve distinto
 * para que no haya manera de confundir "estoy administrando la plataforma" con
 * "estoy trabajando en mi negocio". Es el mismo error que lleva a tocarle algo
 * a un cliente creyendo que uno esta en lo suyo.
 *
 * El guardia esta aqui, en el layout, asi que cubre esta pantalla y todas las
 * que cuelguen de ella sin tener que acordarse en cada una.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();

  return (
    <div className="min-h-dvh bg-[#0b0f19] text-slate-200">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#0b0f19]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[#0b0f19]">
              <Icon name="sliders" className="h-4 w-4" />
            </span>
            <span className="font-display text-sm tracking-tight text-slate-100">
              Todoen1 · Plataforma
            </span>
          </Link>

          <span className="ml-auto hidden text-xs text-slate-500 sm:block">{user.email}</span>

          <Link
            href="/panel"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Ir a mi negocio
          </Link>

          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg px-2 py-1.5 text-xs text-slate-500 transition hover:text-slate-200"
            >
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4">
        <p className="text-[11px] leading-relaxed text-slate-600">
          Aquí solo se ven datos de la cuenta y cuántas cosas tiene registradas. Nunca el contenido:
          ni ventas, ni clientes, ni deudores, ni fotos, ni precios. A los clientes se les prometió
          que nadie ve lo suyo.
        </p>
      </footer>
    </div>
  );
}
