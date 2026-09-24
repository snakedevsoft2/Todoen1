import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, shortDay } from "@/lib/format";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { SupplierCard, SupplierForm, type SupplierRow } from "@/components/SupplierForms";

export const dynamic = "force-dynamic";

export default async function ProveedoresPage() {
  const { user } = await requireOwner();

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

  type Totales = { comprado: number; unidades: number; ultima: string | null; productos: Set<string> };
  const porProveedor = new Map<string, Totales>();
  const vacio = (): Totales => ({ comprado: 0, unidades: 0, ultima: null, productos: new Set() });

  for (const entrada of entradas) {
    if (!entrada.supplierId) continue;
    const row = porProveedor.get(entrada.supplierId) ?? vacio();
    row.comprado += entrada.unitCost * entrada.delta;
    row.unidades += entrada.delta;
    if (!row.ultima || entrada.day > row.ultima) row.ultima = entrada.day;
    row.productos.add(entrada.variant.service.name);
    porProveedor.set(entrada.supplierId, row);
  }

  // Los productos asignados a un proveedor cuentan aunque todavia no le hayas
  // registrado ninguna entrada.
  for (const producto of prendas) {
    if (!producto.supplierId) continue;
    const row = porProveedor.get(producto.supplierId) ?? vacio();
    row.productos.add(producto.name);
    porProveedor.set(producto.supplierId, row);
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
      <PageHeader title="Proveedores" subtitle="A quién le compras y cuánto llevas comprado" />

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
        <Stat label="Unidades compradas" value={String(totalUnidades)} hint="Entradas al inventario" />
        <Stat
          label="Costo promedio"
          value={money(totalUnidades ? Math.round(totalComprado / totalUnidades) : 0, user.currency)}
          hint="Por unidad comprada"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_400px]">
        <Card title="Tus proveedores" subtitle="Toca Editar para cambiar sus datos">
          {rows.length === 0 ? (
            <Empty
              title="Todavía no tienes proveedores"
              hint="Agrega el primero a la derecha y despues asígnale sus productos desde tu catálogo."
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
                      productos: [...stats.productos].sort().slice(0, 8),
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
                En tu <strong>catálogo</strong>, cada producto puede decir a quién se le compra.
              </li>
              <li>
                En <strong>Inventario</strong>, al registrar una <strong>entrada</strong> eliges el
                proveedor y el costo por unidad.
              </li>
              <li>
                Con eso sale solo cuánto le has comprado a cada uno, cuándo fue la última vez y a
                cómo te sale cada producto.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
