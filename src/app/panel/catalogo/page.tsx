import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { BUSINESS_LABEL, ITEM_NOUN, photoUrl } from "@/lib/nav";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { ServiceForm } from "@/components/ServiceForm";
import { CargaMasiva } from "@/components/CargaMasiva";
import { VariantsPanel } from "@/components/VariantsPanel";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { deleteServiceAction, toggleServiceAction } from "@/actions/services";
import { FormSinSenal } from "@/components/SinSenal";
import { esPlanCompleto } from "@/lib/plan";
import { SoloPlanPago } from "@/components/SoloPlanPago";
import { CatalogoFiltrado } from "@/components/CatalogoFiltrado";
import { GestorCategorias } from "@/components/GestorCategorias";
import { categoriasDelNegocio, sincronizarCategorias } from "@/lib/categorias-negocio";
import { aiEnabled } from "@/lib/ai";
import { Vistas360Panel } from "@/components/Vistas360Panel";
import { CATEGORIA_GENERAL, nombreCategoria } from "@/lib/categorias";
import { serviciosConFoto } from "@/lib/imagenes";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const { user, staff } = await requireSession();
  const esDueno = staff.role === "DUENO";
  const isBarber = user.businessType === "BARBERIA";
  const isClothing = user.businessType === "ROPA";
  const noun = ITEM_NOUN[user.businessType];

  // Las categorias escritas a mano o que llegaron desde Excel quedan creadas
  // (al final) antes de mostrar la lista.
  if (esDueno) await sincronizarCategorias(user.id);

  const [services, suppliers, idsConFoto] = await Promise.all([
    db.service.findMany({
    where: { userId: user.id },
    orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
    // Sin el data URL de la foto: pesa mas que todo lo demas junto y aqui solo
    // se necesita saber si la hay. Ver lib/imagenes.ts.
      omit: { image: true },
    // Los negocios que no llevan inventario simplemente traen la lista vacia.
      include: {
        variants: { orderBy: [{ active: "desc" }, { size: "asc" }, { color: "asc" }] },
        views: { orderBy: { angle: "asc" }, select: { id: true, angle: true } },
      },
    }),
    db.supplier.findMany({
      where: { userId: user.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    serviciosConFoto({ userId: user.id }),
  ]);

  const propias = await categoriasDelNegocio(user.id);
  const ordenCategorias = propias.map((c) => c.name);
  const categories = [...new Set([...ordenCategorias, ...services.map((s) => nombreCategoria(s.category))])];
  const activeCount = services.filter((s) => s.active).length;
  const avgPrice = activeCount
    ? Math.round(services.filter((s) => s.active).reduce((s, i) => s + i.price, 0) / activeCount)
    : 0;
  const conFoto = idsConFoto.size;

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

      <div className="mt-5 grid gap-4 lg:grid-cols-[420px_1fr] [&>*]:min-w-0">
        <div className="space-y-4">
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
            currency={user.currency}
            submitLabel={"Agregar " + noun.singular}
          />
        </Card>
        <Card title={"Subir muchos " + noun.plural + " de una vez"} subtitle="Desde Excel o un archivo CSV">
          {!esDueno ? (
            <p className="text-[13px] text-muted">Solo el dueño del negocio sube listas de productos.</p>
          ) : esPlanCompleto(user) ? (
            <CargaMasiva tipo="productos" />
          ) : (
            <SoloPlanPago que="Carga masiva" negocio={user.businessName} />
          )}
        </Card>
        {esDueno && (
          <Card
            title="Tus categorías"
            subtitle="Créalas con el nombre que quieras, ordénalas con las flechas y elige qué productos van en cada una"
          >
            <GestorCategorias
              categorias={propias.map((c) => ({
                id: c.id,
                name: c.name,
                cantidad: services.filter((s) => s.category === c.name).length,
              }))}
              productos={services.map((s) => ({ id: s.id, name: s.name, category: nombreCategoria(s.category) }))}
              enGeneral={services.filter((s) => nombreCategoria(s.category) === CATEGORIA_GENERAL).length}
            />
          </Card>
        )}
        </div>

        <Card
          title="Catálogo"
          subtitle={
            isClothing
              ? "Toca Tallas para cargar el inventario de cada prenda"
              : "Toca una categoría o busca por nombre; en Editar cambias precio, nombre o categoría"
          }
        >
          {services.length === 0 ? (
            <Empty
              title={"Aun no tienes " + noun.plural}
              hint="Crea el primero con el formulario de la izquierda."
            />
          ) : (
            <CatalogoFiltrado
              ordenCategorias={ordenCategorias}
              puedeMover={esDueno}
              items={services.map((s) => {
                const variants = s.variants;
                const stock = variants.reduce((sum, v) => sum + Math.max(0, v.stock), 0);
                const photo = photoUrl(s.id, idsConFoto.has(s.id), s.updatedAt);

                return {
                  id: s.id,
                  name: s.name,
                  price: s.price,
                  category: s.category,
                  createdAt: s.createdAt.getTime(),
                  active: s.active,
                  textos: [s.brand, s.description],
                  nodo: (
                    <>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 gap-3">
                              {isClothing && (
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-panel">
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
                                    <Badge tone="blue">En catálogo</Badge>
                                  )}
                                  {s.trackStock && (
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
                              <FormSinSenal accion="toggleServiceAction" servidor={toggleServiceAction}>
                                <input type="hidden" name="id" value={s.id} />
                                <SubmitButton className="btn-ghost btn-sm" pendingText="...">
                                  {s.active ? "Desactivar" : "Activar"}
                                </SubmitButton>
                              </FormSinSenal>
                              <FormSinSenal accion="deleteServiceAction" servidor={deleteServiceAction}>
                                <input type="hidden" name="id" value={s.id} />
                                <SubmitButton
                                  className="btn-ghost btn-sm px-2 text-bad"
                                  pendingText="..."
                                  ariaLabel="Borrar"
                                  confirm={
                                    "Borrar " +
                                    s.name +
                                    " del catálogo" +
                                    (stock > 0 ? ". Tiene " + stock + " prendas en stock." : "")
                                  }
                                >
                                  <Icon name="trash" className="h-4 w-4" />
                                </SubmitButton>
                              </FormSinSenal>
                            </div>
                          </div>

                          {s.trackStock && (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs font-semibold text-brand-600">
                                {isClothing ? "Tallas y stock" : "Inventario"} ({variants.length})
                              </summary>
                              <div className="mt-3">
                                <VariantsPanel
                                  serviceId={s.id}
                                  currency={user.currency}
                                  clothing={isClothing}
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

                          {esDueno && aiEnabled() && (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs font-semibold text-brand-600">
                                Vista 360 con IA{s.views.length > 0 ? " (lista)" : ""}
                              </summary>
                              <Vistas360Panel serviceId={s.id} conFoto={idsConFoto.has(s.id)} vistas={s.views} />
                            </details>
                          )}

                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-semibold text-brand-600">
                              Editar {isClothing ? "prenda" : ""}
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
                                currency={user.currency}
                                submitLabel="Guardar cambios"
                              />
                            </div>
                          </details>
                    </>
                  ),
                };
              })}
            />
          )}
        </Card>
      </div>
    </>
  );
}
