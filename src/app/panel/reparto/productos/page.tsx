import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { money, shortDay } from "@/lib/format";
import { sesionDeReparto } from "@/lib/reparto-acceso";
import { precioDelDia } from "@/lib/reparto-datos";
import { Card, Empty } from "@/components/ui";
import { ProductoForm } from "@/components/reparto/RepartoForms";

export const dynamic = "force-dynamic";

/** El catalogo del reparto, con el historial de precios de cada producto. */
export default async function ProductosRepartoPage() {
  const { user } = await sesionDeReparto();
  const hoy = todayIn(user.timezone);
  const [productos, inventario] = await Promise.all([
    db.repartoProducto.findMany({
      where: { userId: user.id },
      orderBy: [{ active: "desc" }, { position: "asc" }, { code: "asc" }],
      include: { precios: { orderBy: { desde: "desc" } }, service: { select: { name: true } }, _count: { select: { lineas: true } } },
    }),
    db.service.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
      <Card title="Productos del reparto" subtitle="El precio de cada planilla se guarda en la planilla: cambiarlo aquí no toca los días anteriores.">
        {productos.length === 0 ? (
          <Empty title="Todavía no hay productos" hint="Agrégalos a la derecha o importa el Excel." />
        ) : (
          <ul className="divide-y divide-line" data-lista-productos>
            {productos.map((p) => (
              <li key={p.id} className={"py-2 " + (p.active ? "" : "opacity-60")}>
                <details>
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <span className="w-12 shrink-0 text-[11px] text-subtle">{p.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-strong">{p.name}</span>
                      <span className="block text-[11px] text-subtle">
                        {p.active ? "Activo" : "No sale en planillas nuevas"}
                        {p.service ? " · Inventario: " + p.service.name : ""}
                        {" · " + p._count.lineas + " planillas"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-strong">{money(precioDelDia(p, hoy), user.currency)}</span>
                  </summary>
                  <div className="mt-2 space-y-3 rounded-xl border border-line bg-surface p-3">
                    {p.precios.length > 0 && (
                      <p className="text-[11px] text-muted">
                        Historial: {p.precios.map((h) => money(h.price, user.currency) + " desde " + shortDay(h.desde)).join(" · ")}
                      </p>
                    )}
                    <ProductoForm producto={{ id: p.id, name: p.name, price: p.price, active: p.active, serviceId: p.serviceId }} inventario={inventario} hoy={hoy} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Nuevo producto">
        <ProductoForm inventario={inventario} hoy={hoy} />
      </Card>
    </div>
  );
}
