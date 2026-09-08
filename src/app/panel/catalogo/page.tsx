import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { BUSINESS_LABEL, ITEM_NOUN } from "@/lib/nav";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { ServiceForm } from "@/components/ServiceForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { deleteServiceAction, toggleServiceAction } from "@/actions/services";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const user = await requireUser();
  const isBarber = user.businessType === "BARBERIA";
  const noun = ITEM_NOUN[user.businessType];

  const services = await db.service.findMany({
    where: { userId: user.id },
    orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
  });

  const categories = [...new Set(services.map((s) => s.category))].sort();
  const activeCount = services.filter((s) => s.active).length;
  const avgPrice = activeCount
    ? Math.round(services.filter((s) => s.active).reduce((s, i) => s + i.price, 0) / activeCount)
    : 0;

  const grouped = services.reduce<Record<string, typeof services>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title={"Tus " + noun.plural}
        subtitle={"Lo que vende tu " + BUSINESS_LABEL[user.businessType].toLowerCase()}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Items activos" value={String(activeCount)} tone="brand" />
        <Stat label="Items totales" value={String(services.length)} />
        <Stat label="Precio promedio" value={money(avgPrice, user.currency)} />
        <Stat label="Categorias" value={String(categories.length)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card title={"Agregar " + noun.singular} subtitle="Aparece de inmediato en tus ventas">
          <ServiceForm
            categories={categories}
            showDuration={isBarber}
            submitLabel={"Agregar " + noun.singular}
          />
        </Card>

        <Card title="Catalogo" subtitle="Toca editar para cambiar precio, nombre o duracion">
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
                    {list.map((s) => (
                      <li key={s.id} className="rounded-xl border border-line bg-surface p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-strong">
                              {s.name}
                              {!s.active && <Badge tone="red">Inactivo</Badge>}
                              {isBarber && s.bookable && s.active && <Badge tone="blue">Reservable</Badge>}
                            </p>
                            <p className="mt-0.5 text-xs text-muted">
                              {money(s.price, user.currency)}
                              {isBarber ? " - " + s.durationMin + " min" : ""}
                              {s.cost > 0 ? " - costo " + money(s.cost, user.currency) : ""}
                            </p>
                            {s.description && (
                              <p className="mt-0.5 text-xs italic text-subtle">{s.description}</p>
                            )}
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
                                confirm={"Borrar " + s.name + " del catalogo"}
                              >
                                <Icon name="trash" className="h-4 w-4" />
                              </SubmitButton>
                            </form>
                          </div>
                        </div>

                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-brand-600">
                            Editar
                          </summary>
                          <div className="mt-3 rounded-xl border border-line bg-panel p-3">
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
                              }}
                              categories={categories}
                              showDuration={isBarber}
                              submitLabel="Guardar cambios"
                            />
                          </div>
                        </details>
                      </li>
                    ))}
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
