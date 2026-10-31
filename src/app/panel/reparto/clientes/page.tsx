import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { money } from "@/lib/format";
import { claveDe } from "@/lib/reparto";
import { sesionDeReparto } from "@/lib/reparto-acceso";
import { carteraDe } from "@/lib/reparto-datos";
import { posiblesDuplicados } from "@/lib/reparto-importar";
import { Card, Empty } from "@/components/ui";
import { ClienteForm, UnirClientes } from "@/components/reparto/RepartoForms";

export const dynamic = "force-dynamic";

/** Los clientes de la ruta: corregirlos, decir quien los visita y juntar los repetidos. */
export default async function ClientesRepartoPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user } = await sesionDeReparto();
  const params = await searchParams;
  const q = claveDe(params.q ?? "");
  const [cartera, equipo] = await Promise.all([
    carteraDe(user.id, todayIn(user.timezone)),
    db.staff.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const clientes = [...cartera].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const porNombre = new Map(clientes.map((c) => [c.name, c]));
  const parecidos = posiblesDuplicados(clientes.map((c) => c.name)).flatMap(([a, b]) => {
    const x = porNombre.get(a);
    const y = porNombre.get(b);
    return x && y ? [{ queda: x, sale: y }] : [];
  });
  const visibles = q ? clientes.filter((c) => claveDe(c.name).includes(q)) : clientes;
  const vendedor = new Map(equipo.map((s) => [s.id, s.name]));

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
      <div className="space-y-5">
        {parecidos.length > 0 && (
          <Card title="¿Son el mismo cliente?" subtitle="Nombres parecidos. Nada se junta solo: si son el mismo, júntalos aquí.">
            <ul className="divide-y divide-line" data-parecidos>
              {parecidos.map(({ queda, sale }) => (
                <li key={queda.id + sale.id} className="py-2">
                  <UnirClientes queda={{ id: queda.id, name: queda.name }} sale={{ id: sale.id, name: sale.name }} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="Clientes de la ruta" subtitle={clientes.length + " clientes"}>
          <form action="/panel/reparto/clientes" className="mb-3 flex gap-2">
            <input className="input min-w-0 flex-1 py-1.5 text-sm" type="search" name="q" defaultValue={params.q ?? ""} placeholder="Buscar cliente" aria-label="Buscar cliente" />
            <button type="submit" className="btn-primary btn-sm">Buscar</button>
          </form>
          {visibles.length === 0 ? (
            <Empty title="No hay clientes con ese nombre" />
          ) : (
            <ul className="divide-y divide-line" data-lista-clientes-reparto>
              {visibles.map((c) => (
                <li key={c.id} className="py-2">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-strong">{c.name}</span>
                        <span className="block text-[11px] text-subtle">{c.staffId ? vendedor.get(c.staffId) : "Sin vendedor"}</span>
                      </span>
                      <span className={"shrink-0 text-sm font-bold " + (c.saldo > 0 ? "text-bad" : "text-good")}>
                        {c.saldo > 0 ? money(c.saldo, user.currency) : "Al día"}
                      </span>
                    </summary>
                    <div className="mt-2 rounded-xl border border-line bg-surface p-3">
                      <ClienteForm cliente={{ id: c.id, name: c.name, staffId: c.staffId, notes: null }} equipo={equipo} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Nuevo cliente">
        <ClienteForm equipo={equipo} />
      </Card>
    </div>
  );
}
