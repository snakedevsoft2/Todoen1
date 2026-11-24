import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeIn, todayIn } from "@/lib/dates";
import { money, pretty12h } from "@/lib/format";
import { esManicuristaDeMbNails } from "@/lib/mb-nails";
import { ordenDeCategorias } from "@/lib/categorias-negocio";
import { CATEGORIA_GENERAL } from "@/lib/categorias";
import { Card, Empty, PageHeader } from "@/components/ui";
import { VenderMecato, type GrupoMecato } from "@/components/VenderMecato";

export const dynamic = "force-dynamic";

/**
 * Mecato: la manicurista de MB Nails vende sin cita (bebidas, mecato o lo que
 * este en la lista), con cada categoria por separado. Ver lib/mb-nails.ts.
 *
 * Primero salen las categorias de productos (las que no se reservan, como
 * Bebidas y Mecato) y despues las de servicios, cada una en el orden de la
 * dueña.
 */
export default async function MecatoPage() {
  const { user, staff } = await requireSession({ manicuristaOk: true });
  if (!esManicuristaDeMbNails(user, staff)) redirect("/panel");

  const hoy = todayIn(user.timezone);
  const [productos, orden, vendidoHoy] = await Promise.all([
    db.service.findMany({
      where: { userId: user.id, active: true },
      orderBy: [{ price: "asc" }, { name: "asc" }],
      select: { id: true, name: true, price: true, category: true, bookable: true },
    }),
    ordenDeCategorias(user.id),
    // Lo que vendio hoy sin cita.
    db.sale.findMany({
      where: { userId: user.id, staffId: staff.id, day: hoy, appointmentId: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, total: true, clientName: true, createdAt: true, items: { select: { name: true, qty: true } } },
    }),
  ]);

  const porCategoria = new Map<string, typeof productos>();
  for (const p of productos) porCategoria.set(p.category, [...(porCategoria.get(p.category) ?? []), p]);
  const posicion = (c: string) => (c === CATEGORIA_GENERAL ? Number.MAX_SAFE_INTEGER : orden.indexOf(c) === -1 ? orden.length : orden.indexOf(c));
  const esDeProductos = (c: string) => porCategoria.get(c)!.every((p) => !p.bookable);
  const grupos: GrupoMecato[] = [...porCategoria.keys()]
    .sort((a, b) => Number(esDeProductos(b)) - Number(esDeProductos(a)) || posicion(a) - posicion(b))
    .map((categoria) => ({
      categoria,
      productos: porCategoria.get(categoria)!.map(({ id, name, price }) => ({ id, name, price })),
    }));

  const totalHoy = vendidoHoy.reduce((s, v) => s + v.total, 0);

  return (
    <>
      <PageHeader title="Mecato" subtitle="Vende sin cita: escoge la categoría y toca + en lo que se lleva" />
      {grupos.length === 0 ? (
        <Card>
          <Empty title="Todavía no hay productos" hint="La dueña los agrega en Servicios y precios." />
        </Card>
      ) : (
        <VenderMecato grupos={grupos} currency={user.currency} />
      )}

      {vendidoHoy.length > 0 && (
        <Card title="Vendido hoy sin cita" subtitle={"En total " + money(totalHoy, user.currency)} className="mt-4">
          <ul className="space-y-2">
            {vendidoHoy.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm" data-vendido>
                <div className="min-w-0">
                  <p className="font-semibold text-strong">
                    {pretty12h(timeIn(v.createdAt, user.timezone))}
                    {v.clientName ? " · " + v.clientName : ""}
                  </p>
                  <p className="text-xs text-muted">{v.items.map((i) => i.qty + "x " + i.name).join(", ")}</p>
                </div>
                <span className="shrink-0 font-bold text-good">{money(v.total, user.currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
