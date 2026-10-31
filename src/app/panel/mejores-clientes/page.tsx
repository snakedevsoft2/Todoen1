import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, startOfMonth, todayIn } from "@/lib/dates";
import { money, shortDay } from "@/lib/format";
import { esAdminDeChopo } from "@/lib/chopo";
import { coincideBusqueda } from "@/lib/categorias";
import { clientesQueCompran } from "@/lib/mejores-clientes";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const PERIODOS = [
  { key: "mes", label: "Este mes" },
  { key: "anterior", label: "Mes pasado" },
  { key: "90", label: "Últimos 90 días" },
  { key: "anio", label: "Este año" },
  { key: "todo", label: "Todo" },
] as const;

/** Cuantos se marcan como los mejores, los candidatos a promocion. */
const TOP = 10;

/** Desde y hasta del periodo, en dias "YYYY-MM-DD" del negocio. */
function rango(periodo: string, hoy: string): { desde: string; hasta: string } {
  const inicioMes = startOfMonth(hoy);
  switch (periodo) {
    case "anterior": {
      const finAnterior = addDays(inicioMes, -1);
      return { desde: startOfMonth(finAnterior), hasta: finAnterior };
    }
    case "90":
      return { desde: addDays(hoy, -89), hasta: hoy };
    case "anio":
      return { desde: hoy.slice(0, 4) + "-01-01", hasta: hoy };
    case "todo":
      return { desde: "0000-01-01", hasta: "9999-12-31" };
    default:
      return { desde: inicioMes, hasta: hoy };
  }
}

/**
 * Los clientes que mas compran, para saber a quien darle promociones (ver
 * lib/mejores-clientes.ts). Solo la administradora de Chopo Snacks.
 */
export default async function MejoresClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; q?: string }>;
}) {
  const { user, staff } = await requireSession();
  if (!esAdminDeChopo(user, staff)) notFound();

  const params = await searchParams;
  const periodo = PERIODOS.some((x) => x.key === params.p) ? params.p! : "mes";
  const busqueda = String(params.q ?? "").trim().slice(0, 80);
  const hoy = todayIn(user.timezone);
  const { desde, hasta } = rango(periodo, hoy);
  const cur = user.currency;

  const [ventas, fiados, mostrador] = await Promise.all([
    db.sale.findMany({
      // Los abonos de un fiado (CARTERA) no son otra compra: el fiado ya se conto.
      where: { userId: user.id, day: { gte: desde, lte: hasta }, origin: { not: "CARTERA" }, clientName: { not: null } },
      select: { clientName: true, total: true, day: true, items: { select: { name: true, qty: true } } },
    }),
    db.debt.findMany({
      // Si ya estaba registrado en Ventas, esa venta ya lo cuenta.
      where: { userId: user.id, day: { gte: desde, lte: hasta }, status: { not: "ANULADA" }, alreadyInvoiced: false },
      select: { clientName: true, amount: true, day: true, concept: true },
    }),
    db.sale.aggregate({
      where: { userId: user.id, day: { gte: desde, lte: hasta }, origin: { not: "CARTERA" }, clientName: null },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  const todos = clientesQueCompran(
    ventas.map((v) => ({ clientName: v.clientName ?? "", total: v.total, day: v.day, items: v.items })),
    fiados
  );
  const lugar = new Map(todos.map((c, i) => [c, i + 1]));
  const visibles = busqueda ? todos.filter((c) => coincideBusqueda([c.nombre], busqueda)) : todos;
  const vendido = todos.reduce((s, c) => s + c.total, 0);

  const enlace = (cambio: { p?: string; q?: string }) => {
    const u = new URLSearchParams();
    const p = cambio.p ?? periodo;
    const q = cambio.q ?? busqueda;
    if (p !== "mes") u.set("p", p);
    if (q) u.set("q", q);
    const s = u.toString();
    return "/panel/mejores-clientes" + (s ? "?" + s : "");
  };

  return (
    <>
      <PageHeader
        title="Mejores clientes"
        subtitle="Cuánto te compra cada cliente, para saber a quién darle promociones · Solo lo ves tú"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {PERIODOS.map((x) => (
          <Link key={x.key} href={enlace({ p: x.key })} className={periodo === x.key ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>
            {x.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Clientes que compraron" value={String(todos.length)} tone="brand" />
        <Stat label="Les vendiste" value={money(vendido, cur)} hint="Contado y fiado" />
        <Stat
          label="Promedio por cliente"
          value={money(todos.length ? Math.round(vendido / todos.length) : 0, cur)}
        />
        <Stat
          label="Sin nombre (mostrador)"
          value={money(mostrador._sum.total ?? 0, cur)}
          hint={mostrador._count + (mostrador._count === 1 ? " venta que no es de nadie" : " ventas que no son de nadie")}
        />
      </div>

      <Card
        className="mt-5"
        title={periodo === "todo" ? "Desde siempre" : shortDay(desde) + " al " + shortDay(hasta)}
        subtitle="De quien más te compra a quien menos. Los primeros 10 son los candidatos a promoción."
      >
        <form action="/panel/mejores-clientes" className="mb-3 flex gap-2" data-buscar-cliente>
          {periodo !== "mes" && <input type="hidden" name="p" value={periodo} />}
          <input
            className="input min-w-0 flex-1 py-1.5 text-sm"
            type="search"
            name="q"
            defaultValue={busqueda}
            placeholder="Buscar un cliente"
            aria-label="Buscar un cliente"
          />
          <button type="submit" className="btn-primary btn-sm shrink-0">
            <Icon name="search" className="h-4 w-4" />
            Buscar
          </button>
        </form>

        {visibles.length === 0 ? (
          <Empty
            title={busqueda ? "Nadie con ese nombre en este periodo" : "Todavía no hay compras con nombre de cliente"}
            hint="Solo cuentan las ventas y los fiados que llevan el nombre del cliente. Las de mostrador no se pueden atribuir a nadie."
          />
        ) : (
          <ol className="space-y-2" data-ranking-clientes>
            {visibles.map((c) => {
              const n = lugar.get(c) ?? 0;
              return (
                <li key={c.nombre + n} className="rounded-xl border border-line bg-surface">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
                      <span
                        className={
                          "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold " +
                          (n <= TOP ? "bg-brand-600 text-white" : "bg-panel text-muted")
                        }
                      >
                        {n}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-strong">{c.nombre}</span>
                          {n <= TOP && (
                            <span className="rounded-full bg-good-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-good">
                              Promoción
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-subtle">
                          {c.compras} {c.compras === 1 ? "compra" : "compras"} · última {shortDay(c.ultima)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-bold text-strong">{money(c.total, cur)}</span>
                        <span className="block text-[11px] text-subtle">
                          {money(Math.round(c.total / c.compras), cur)} c/u
                        </span>
                      </span>
                    </summary>
                    <div className="border-t border-line px-3 py-2.5 text-xs">
                      <p className="text-muted">
                        De contado {money(c.contado, cur)} · Fiado {money(c.fiado, cur)}
                      </p>
                      {c.productos.length > 0 ? (
                        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                          {c.productos.slice(0, 10).map((p) => (
                            <li key={p.name} className="flex justify-between gap-2 rounded-lg bg-panel px-2 py-1">
                              <span className="min-w-0 truncate text-body">{p.name}</span>
                              <span className="shrink-0 font-semibold text-strong">{p.qty}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-subtle">Sin detalle de productos.</p>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </>
  );
}
