import Link from "next/link";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { money, shortDay } from "@/lib/format";
import { claveDe, tramoDe } from "@/lib/reparto";
import { sesionDeReparto } from "@/lib/reparto-acceso";
import { carteraDe } from "@/lib/reparto-datos";
import { Card, Empty, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const TRAMOS = ["0-7 días", "8-15 días", "16-30 días", "31-60 días", "Más de 60 días"];

/**
 * La cartera de la ruta, calculada de los creditos y cobros (ver
 * carteraDe): quien debe, cuanto, desde cuando y que vendedor lo visita.
 */
export default async function CarteraRepartoPage({ searchParams }: { searchParams: Promise<{ q?: string; v?: string }> }) {
  const { user } = await sesionDeReparto();
  const params = await searchParams;
  const hoy = todayIn(user.timezone);
  const cur = user.currency;
  const q = claveDe(params.q ?? "");

  const [cartera, equipo, revisar] = await Promise.all([
    carteraDe(user.id, hoy),
    db.staff.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.repartoCobro.findMany({
      where: { userId: user.id, revisar: true, planilla: { estado: { not: "ANULADA" } } },
      orderBy: { planilla: { day: "desc" } },
      take: 50,
      select: { id: true, documento: true, valor: true, cliente: { select: { name: true } }, planilla: { select: { id: true, day: true, staff: { select: { name: true } } } } },
    }),
  ]);
  const nombreVendedor = new Map(equipo.map((s) => [s.id, s.name]));

  const deben = cartera
    .filter((c) => c.saldo > 0)
    .filter((c) => !params.v || c.staffId === params.v)
    .filter((c) => !q || claveDe(c.name).includes(q));
  const total = deben.reduce((s, c) => s + c.saldo, 0);

  // Por antiguedad: lo que falta de cada documento, en su tramo.
  const porTramo = new Map<string, number>(TRAMOS.map((t) => [t, 0]));
  for (const c of deben) for (const d of c.documentos) if (d.saldo > 0) porTramo.set(tramoDe(d.dias), (porTramo.get(tramoDe(d.dias)) ?? 0) + d.saldo);

  const exportar = "/panel/reparto/exportar?tipo=cartera" + (params.v ? "&v=" + params.v : "");

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Por cobrar" value={money(total, cur)} hint={deben.length + " clientes"} tone="amber" />
        <Stat label="Más de 30 días" value={money((porTramo.get("31-60 días") ?? 0) + (porTramo.get("Más de 60 días") ?? 0), cur)} tone="bad" />
        <Stat label="Hasta 15 días" value={money((porTramo.get("0-7 días") ?? 0) + (porTramo.get("8-15 días") ?? 0), cur)} tone="good" />
        <Stat label="Cobros por revisar" value={String(revisar.length)} hint="Sin documento al que aplicarse" />
      </div>

      <Card className="mt-5" title="Antigüedad de la cartera">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-tramos>
          {TRAMOS.map((t) => (
            <div key={t} className="rounded-xl border border-line bg-surface p-2.5">
              <p className="text-[11px] text-muted">{t}</p>
              <p className="text-sm font-bold text-strong">{money(porTramo.get(t) ?? 0, cur)}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card
        className="mt-5"
        title="Quién debe"
        subtitle="De mayor a menor saldo. Toca un cliente para ver sus documentos."
        action={
          <a href={exportar} className="btn-ghost btn-sm" data-exportar-cartera>
            <Icon name="download" className="h-4 w-4" />
            Excel
          </a>
        }
      >
        <form action="/panel/reparto/cartera" className="mb-3 flex flex-wrap gap-2">
          <input className="input min-w-0 flex-1 py-1.5 text-sm" type="search" name="q" defaultValue={params.q ?? ""} placeholder="Buscar cliente" aria-label="Buscar cliente" />
          <select name="v" defaultValue={params.v ?? ""} className="input w-auto py-1.5 text-sm" aria-label="Vendedor">
            <option value="">Todos los vendedores</option>
            {equipo.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary btn-sm">Buscar</button>
        </form>
        {deben.length === 0 ? (
          <Empty title="Nadie debe con ese filtro" />
        ) : (
          <ul className="space-y-2" data-cartera-clientes>
            {deben.map((c) => (
              <li key={c.id} className="rounded-xl border border-line bg-surface">
                <details>
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-strong">{c.name}</span>
                      <span className="block text-[11px] text-subtle">
                        {c.documentos.filter((d) => d.saldo > 0).length} documentos
                        {c.staffId ? " · " + (nombreVendedor.get(c.staffId) ?? "") : ""}
                        {c.ultimoMovimiento ? " · último movimiento " + shortDay(c.ultimoMovimiento) : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-bad">{money(c.saldo, cur)}</span>
                  </summary>
                  <div className="border-t border-line px-3 py-2">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                          <th>Fecha</th>
                          <th>Doc.</th>
                          <th className="text-right">Valor</th>
                          <th className="text-right">Cobrado</th>
                          <th className="text-right">Saldo</th>
                          <th className="text-right">Días</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.documentos.filter((d) => d.saldo !== 0).map((d) => (
                          <tr key={d.id} className="border-t border-line">
                            <td className="py-1">{shortDay(d.day)}</td>
                            <td>
                              {d.planillaId ? <Link href={"/panel/reparto/" + d.planillaId} className="link">{d.documento ?? "s/n"}</Link> : d.documento ?? "s/n"}
                              {!d.planillaId && <span className="block text-[10px] text-subtle" title={d.notes ?? ""}>Saldo inicial</span>}
                            </td>
                            <td className="text-right">{money(d.valor, cur)}</td>
                            <td className="text-right">{money(d.cobrado, cur)}</td>
                            <td className={"text-right font-semibold " + (d.saldo < 0 ? "text-bad" : "text-strong")}>{money(d.saldo, cur)}</td>
                            <td className="text-right">{d.dias}</td>
                          </tr>
                        ))}
                        {c.abonosSinDocumento > 0 && (
                          <tr className="border-t border-line text-warn">
                            <td className="py-1" colSpan={4}>Abonos sin documento (por revisar)</td>
                            <td className="text-right font-semibold">−{money(c.abonosSinDocumento, cur)}</td>
                            <td />
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </details>
              </li>
            ))}
            <li className="flex justify-between px-3 py-2 text-sm font-bold text-strong">
              <span>Total por cobrar</span>
              <span className="rounded bg-[#ffff00] px-2 text-black">{money(total, cur)}</span>
            </li>
          </ul>
        )}
      </Card>

      {revisar.length > 0 && (
        <Card className="mt-5" title="Cobros por revisar" subtitle="Se cobraron, pero no se encontró el documento: bajan el saldo del cliente igual.">
          <ul className="divide-y divide-line text-[13px]" data-cobros-revisar>
            {revisar.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-strong">{r.cliente?.name ?? "Sin cliente"}</span>
                  <span className="ml-2 text-[11px] text-subtle">
                    Doc. {r.documento ?? "s/n"} · {r.planilla.staff.name} · {shortDay(r.planilla.day)}
                  </span>
                </span>
                <span className="font-semibold">{money(r.valor, cur)}</span>
                <Link href={"/panel/reparto/" + r.planilla.id} className="btn-ghost btn-sm">Ver</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
