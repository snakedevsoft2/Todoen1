import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { BUSINESS_LABEL, ITEM_NOUN, photoUrl } from "@/lib/nav";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { ServiceForm } from "@/components/ServiceForm";
import { VariantsPanel } from "@/components/VariantsPanel";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { deleteServiceAction, toggleServiceAction } from "@/actions/services";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const user = await requireUser();
  const isBarber = user.businessType === "BARBERIA";
  const isClothing = user.businessType === "ROPA";
  const noun = ITEM_NOUN[user.businessType];

  const [services, suppliers] = await Promise.all([
    db.service.findMany({
    where: { userId: user.id },
    orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
    // Los negocios que no llevan inventario simplemente traen la lista vacia.
      include: { variants: { orderBy: [{ active: "desc" }, { size: "asc" }, { color: "asc" }] } },
    }),
    isClothing
      ? db.supplier.findMany({
          where: { userId: user.id, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const categories = [...new Set(services.map((s) => s.category))].sort();
  const activeCount = services.filter((s) => s.active).length;
  const avgPrice = activeCount
    ? Math.round(services.filter((s) => s.active).reduce((s, i) => s + i.price, 0) / activeCount)
    : 0;
  const conFoto = services.filter((s) => s.image).length;

  const grouped = services.reduce<Record<string, typeof services>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title={"Tus " + noun.plural}
        subtitle={"Lo que vende tu " + BUSINESS_LABEL[user.businessType].toLowerCase()}
      >
        {isClothing && (
          <Link href="/panel/inventario" className="btn-ghost btn-sm">
            <Icon name="box" className="h-4 w-4" />
            Ver inventario
          </Link>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Items activos" value={String(activeCount)} tone="brand" />
        <Stat label="Items totales" value={String(services.length)} />
        <Stat label="Precio promedio" value={money(avgPrice, user.currency)} />
        {isClothing ? (
          <Stat
            label="Con foto"
            value={String(conFoto)}
            hint={"de " + services.length + " prendas"}
            tone={conFoto === services.length ? "good" : "default"}
          />
        ) : (
          <Stat label="Categorias" value={String(categories.length)} />
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card
          title={"Agregar " + noun.singular}
          subtitle={
            isClothing
              ? "Despues le agregas las tallas y el stock"
              : "Aparece de inmediato en tus ventas"
          }
        >
          <ServiceForm
            categories={categories}
            showDuration={isBarber}
            clothing={isClothing}
            photoLabel={"Foto (" + noun.singular + ")"}
            suppliers={suppliers}
            submitLabel={"Agregar " + noun.singular}
          />
        </Card>

        <Card
          title="Catalogo"
          subtitle={
            isClothing
              ? "Toca Tallas para cargar el inventario de cada prenda"
              : "Toca editar para cambiar precio, nombre o duracion"
          }
        >
          {services.length === 0 ? (
            <Empty
              title={"Aun no tienes " + noun.plural}
              hint="Crea el primero con el formulario de la izquierda."
            />
          ) : (
            <div className="space-y-5">
              {Object.entries(grouped).map(([category, list]) => (
                <div key={category}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {category}
                  </p>
                  <ul className="space-y-2">
                    {list.map((s) => {
                      const variants = s.variants;
                      const stock = variants.reduce((sum, v) => sum + Math.max(0, v.stock), 0);
                      const photo = photoUrl(s.id, s.image, s.updatedAt);

                      return (
                        <li key={s.id} className="rounded-xl border-2 border-edge bg-surface p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 gap-3">
                              {isClothing && (
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-edge bg-panel">
                                  {photo ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={photo}
                                      alt={s.name}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <Icon name="shirt" className="h-6 w-6 text-subtle" />
                                  )}
                                </div>
                              )}

                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-strong">
                                  {s.name}
                                  {!s.active && <Badge tone="red">Inactivo</Badge>}
                                  {isBarber && s.bookable && s.active && (
                                    <Badge tone="blue">Reservable</Badge>
                                  )}
                                  {isClothing && s.showcase && s.active && (
                                    <Badge tone="blue">En catalogo</Badge>
                                  )}
                                  {isClothing && s.trackStock && (
                                    <Badge tone={stock > 0 ? "green" : "red"}>
                                      {stock} en stock
                                    </Badge>
                                  )}
                                </p>
                                <p className="mt-0.5 text-xs text-muted">
                                  {money(s.price, user.currency)}
                                  {isBarber ? " - " + s.durationMin + " min" : ""}
                                  {s.brand ? " - " + s.brand : ""}
                                  {s.cost > 0 ? " - costo " + money(s.cost, user.currency) : ""}
                                </p>
                                {s.description && (
                                  <p className="mt-0.5 text-xs italic text-subtle">{s.description}</p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <form action={toggleServiceAction}>
                                <input type="hidden" name="id" value={s.id} />
                                <SubmitButton className="btn-ghost btn-sm" pendingText="...">
                                  {s.active ? "Desactivar" : "Activar"}
                                </SubmitButton>
                              </form>
                              <form action={deleteServiceAction}>
                                <input type="hidden" name="id" value={s.id} />
                                <SubmitButton
                                  className="btn-ghost btn-sm px-2 text-bad"
                                  pendingText="..."
                                  ariaLabel="Borrar"
                                  confirm={
                                    "Borrar " +
                                    s.name +
                                    " del catalogo" +
                                    (stock > 0 ? ". Tiene " + stock + " prendas en stock." : "")
                                  }
                                >
                                  <Icon name="trash" className="h-4 w-4" />
                                </SubmitButton>
                              </form>
                            </div>
                          </div>

                          {isClothing && s.trackStock && (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs font-semibold text-brand-600">
                                Tallas y stock ({variants.length})
                              </summary>
                              <div className="mt-3">
                                <VariantsPanel
                                  serviceId={s.id}
                                  currency={user.currency}
                                  variants={variants.map((v) => ({
                                    id: v.id,
                                    size: v.size,
                                    color: v.color,
                                    sku: v.sku,
                                    stock: v.stock,
                                    minStock: v.minStock,
                                    price: v.price,
                                    cost: v.cost,
                                    active: v.active,
                                  }))}
                                />
                              </div>
                            </details>
                          )}

                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-semibold text-brand-600">
                              Editar {isClothing ? "prenda" : ""}
                            </summary>
                            <div className="mt-3 rounded-xl border-2 border-edge bg-panel p-3">
                              <ServiceForm
                                service={{
                                  id: s.id,
                                  name: s.name,
                                  description: s.description,
                                  price: s.price,
                                  cost: s.cost,
                                  durationMin: s.durationMin,
                                  category: s.category,
                                  bookable: s.bookable,
                                  active: s.active,
                                  brand: s.brand,
                                  trackStock: s.trackStock,
                                  showcase: s.showcase,
                                  supplierId: s.supplierId,
                                }}
                                categories={categories}
                                showDuration={isBarber}
                                clothing={isClothing}
                                photo={photo}
                                photoLabel={"Foto (" + noun.singular + ")"}
                                suppliers={suppliers}
                                submitLabel="Guardar cambios"
                              />
                            </div>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
