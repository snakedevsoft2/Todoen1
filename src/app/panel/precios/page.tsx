import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { esMbNails } from "@/lib/mb-nails";
import { ordenDeCategorias } from "@/lib/categorias-negocio";
import { CATEGORIA_GENERAL } from "@/lib/categorias";
import { Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * La lista de precios de MB Nails para sus manicuristas: la ven, no la
 * cambian (no hay ni un campo ni un boton). Los precios los pone la dueña en
 * Servicios y precios. Ver lib/mb-nails.ts.
 */
export default async function PreciosPage() {
  const { user } = await requireSession({ manicuristaOk: true });
  if (!esMbNails(user.businessName)) redirect("/panel");

  const [productos, orden] = await Promise.all([
    db.service.findMany({
      where: { userId: user.id, active: true },
      orderBy: [{ price: "asc" }, { name: "asc" }],
      select: { id: true, name: true, price: true, category: true, description: true },
    }),
    ordenDeCategorias(user.id),
  ]);

  const grupos = new Map<string, typeof productos>();
  for (const p of productos) grupos.set(p.category, [...(grupos.get(p.category) ?? []), p]);
  const posicion = (c: string) => (c === CATEGORIA_GENERAL ? Number.MAX_SAFE_INTEGER : orden.indexOf(c) === -1 ? orden.length : orden.indexOf(c));
  const categorias = [...grupos.keys()].sort((a, b) => posicion(a) - posicion(b));

  return (
    <>
      <PageHeader title="Lista de precios" subtitle="Para consultar. Los precios los cambia la dueña." />
      {productos.length === 0 ? (
        <Card>
          <Empty title="Todavía no hay precios" hint="La dueña los agrega en Servicios y precios." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {categorias.map((c) => (
            <Card key={c} title={c}>
              <ul className="divide-y divide-line" data-lista-precios>
                {grupos.get(c)!.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-strong">{p.name}</p>
                      {p.description && <p className="text-xs text-muted">{p.description}</p>}
                    </div>
                    <span className="shrink-0 text-sm font-bold text-strong">{money(p.price, user.currency)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
