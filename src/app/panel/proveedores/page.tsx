import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, shortDay } from "@/lib/format";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { SupplierCard, SupplierForm, type SupplierRow } from "@/components/SupplierForms";

export const dynamic = "force-dynamic";

export default async function ProveedoresPage() {
  const { user } = await requireOwner();
  // Por ahora comprar mercancia solo tiene sentido en la tienda de ropa.
  if (user.businessType !== "ROPA") redirect("/panel");

  const [suppliers, entradas, prendas] = await Promise.all([
    db.supplier.findMany({
      where: { userId: user.id },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    // Solo las entradas: son las compras de verdad.
    db.stockMove.findMany({
      where: { userId: user.id, type: "ENTRADA", supplierId: { not: null } },
      select: {
        supplierId: true,
        delta: true,
        unitCost: true,
        day: true,
        variant: { select: { service: { select: { name: true } } } },
      },
    }),
    db.service.findMany({
      where: { userId: user.id, supplierId: { not: null } },
      select: { name: true, supplierId: true },
    }),
  ]);

  type Totales = { comprado: number; unidades: number; ultima: string | null; prendas: Set<string> };
  const porProveedor = new Map<string, Totales>();
  const vacio = (): Totales => ({ comprado: 0, unidades: 0, ultima: null, prendas: new Set() });

  for (const entrada of entradas) {
    if (!entrada.supplierId) continue;
    const row = porProveedor.get(entrada.supplierId) ?? vacio();
    row.comprado += entrada.unitCost * entrada.delta;
    row.unidades += entrada.delta;
    if (!row.ultima || entrada.day > row.ultima) row.ultima = entrada.day;
    row.prendas.add(entrada.variant.service.name);
    porProveedor.set(entrada.supplierId, row);
  }

  // Las prendas asignadas a un proveedor cuentan aunque todavia no le hayas
  // registrado ninguna entrada.
  for (const prenda of prendas) {
    if (!prenda.supplierId) continue;
    const row = porProveedor.get(prenda.supplierId) ?? vacio();
    row.prendas.add(prenda.name);
    porProveedor.set(prenda.supplierId, row);
  }

  const totalComprado = [...porProveedor.values()].reduce((s, r) => s + r.comprado, 0);
  const totalUnidades = [...porProveedor.values()].reduce((s, r) => s + r.unidades, 0);
  const activos = suppliers.filter((s) => s.active).length;

  const rows: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    contact: s.contact,
    phone: s.phone,
    notes: s.notes,
    active: s.active,
  }));

  return (
    <>
      <PageHeader
        title="Proveedores"
        subtitle="A quien le compras cada prenda y cuanto llevas comprado"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Proveedores activos"
          value={String(activos)}
          hint={suppliers.length + " en total"}
          tone="brand"
        />
        <Stat
          label="Comprado en total"
          value={money(totalComprado, user.currency)}
          hint="Segun las entradas registradas"
          tone="bad"
        />
        <Stat label="Prendas compradas" value={String(totalUnidades)} hint="Unidades que entraron" />
        <Stat
          label="Costo promedio"
          value={money(totalUnidades ? Math.round(totalComprado / totalUnidades) : 0, user.currency)}
          hint="Por prenda comprada"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_400px]">
        <Card title="Tus proveedores" subtitle="Toca Editar para cambiar sus datos">
          {rows.length === 0 ? (
            <Empty
              title="Todavia no tienes proveedores"
              hint="Agrega el primero a la derecha y despues asignale sus prendas desde Productos."
            />
          ) : (
            <ul className="space-y-3">
              {rows.map((supplier) => {
                const stats = porProveedor.get(supplier.id) ?? vacio();
                return (
                  <SupplierCard
                    key={supplier.id}
                    supplier={supplier}
                    stats={{
                      comprado: money(stats.comprado, user.currency),
                      unidades: stats.unidades,
                      ultima: stats.ultima ? shortDay(stats.ultima) : null,
                      prendas: [...stats.prendas].sort().slice(0, 8),
                    }}
                  />
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Agregar un proveedor">
            <SupplierForm submitLabel="Agregar proveedor" />
          </Card>

          <Card title="Como se llenan estas cifras">
            <ul className="space-y-2 text-sm text-body">
              <li>
                En <strong>Productos</strong>, cada prenda puede decir a quien se le compra.
              </li>
              <li>
                En <strong>Inventario</strong>, al registrar una <strong>entrada</strong> eliges el
                proveedor y el costo por unidad.
              </li>
              <li>
                Con eso sale solo cuanto le has comprado a cada uno, cuando fue la ultima vez y a
                como te sale cada prenda.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
