import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { logoUrl, photoUrl } from "@/lib/nav";
import { variantLabel } from "@/lib/variants";
import { normalizePhone } from "@/lib/whatsapp";
import { Icon } from "@/components/Icon";
import { ThemeStyle } from "@/components/ThemeStyle";
import { BrandMark } from "@/components/BrandMark";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const shop = await db.user.findUnique({
    where: { slug },
    select: { businessName: true, tagline: true },
  });
  return {
    title: shop ? "Catalogo - " + shop.businessName : "Catalogo",
    description: shop?.tagline ?? undefined,
  };
}

/**
 * Vitrina publica de la tienda de ropa.
 *
 * No es una tienda en linea: muestra lo que hay, con foto, precio y las tallas
 * que quedan, y manda al cliente a WhatsApp para cerrar la venta. Solo salen
 * las prendas activas que el negocio marco para el catalogo.
 */
export default async function CatalogoPublicoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cat?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const shop = await db.user.findUnique({ where: { slug } });
  if (!shop) notFound();

  // La vitrina es de la tienda de ropa. La barberia tiene su agenda publica en
  // la otra direccion, asi que la mandamos alla.
  if (shop.businessType !== "ROPA") {
    if (shop.businessType === "BARBERIA") redirect("/reservar/" + slug);
    notFound();
  }

  const products = await db.service.findMany({
    where: { userId: shop.id, active: true, showcase: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      variants: {
        where: { active: true },
        orderBy: [{ size: "asc" }, { color: "asc" }],
      },
    },
  });

  const categories = [...new Set(products.map((p) => p.category))].sort();
  const category = query.cat && categories.includes(query.cat) ? query.cat : "";
  const visible = category ? products.filter((p) => p.category === category) : products;

  const phone = normalizePhone(shop.whatsappNumber) ?? normalizePhone(shop.phone);

  const orderLink = (productName: string) => {
    if (!phone) return null;
    const text =
      "Hola " + shop.businessName + ", me interesa: " + productName + ". Sigue disponible?";
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <ThemeStyle brandColor={shop.brandColor} theme={shop.theme} />

      <header className="text-center">
        <div className="mx-auto mb-3 flex justify-center">
          <BrandMark
            name={shop.businessName}
            logo={logoUrl(shop.slug, shop.logo, shop.updatedAt)}
            size="xl"
          />
        </div>
        <h1 className="text-2xl font-bold text-strong sm:text-3xl">{shop.businessName}</h1>
        {shop.tagline && (
          <p className="mx-auto mt-1 max-w-md text-sm text-brand-600">{shop.tagline}</p>
        )}
        {shop.address && <p className="mt-2 text-xs text-subtle">{shop.address}</p>}
        {shop.phone && (
          <p className="mt-1 text-xs text-subtle">
            <Icon name="phone" className="mr-1 inline h-3 w-3" />
            {shop.phone}
          </p>
        )}
      </header>

      {categories.length > 1 && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a
            href={"/catalogo/" + slug}
            className={category === "" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
          >
            Todo
          </a>
          {categories.map((c) => (
            <a
              key={c}
              href={"/catalogo/" + slug + "?cat=" + encodeURIComponent(c)}
              className={category === c ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
            >
              {c}
            </a>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="card mt-6 text-center">
          <p className="text-sm font-medium text-body">Todavia no hay prendas publicadas.</p>
          <p className="mt-1 text-xs text-subtle">Vuelve pronto o escribenos directamente.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((product) => {
            const photo = photoUrl(product.id, product.image, product.updatedAt);
            const available = product.variants.filter((v) => v.stock > 0);
            // Solo esta agotada si tiene tallas cargadas y ninguna quedo. Una
            // prenda a la que todavia no le cargaron el inventario se muestra
            // normal: no es que se haya acabado, es que aun no la contaron.
            const soldOut =
              product.trackStock && product.variants.length > 0 && available.length === 0;
            const link = orderLink(product.name);

            return (
              <article
                key={product.id}
                className="card flex flex-col overflow-hidden p-0"
              >
                <div className="relative flex aspect-[4/5] items-center justify-center bg-panel">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <Icon name="shirt" className="h-12 w-12 text-subtle" />
                  )}
                  {soldOut && (
                    <span className="absolute right-2 top-2 rounded-full bg-bad px-2.5 py-1 text-[11px] font-bold text-white">
                      Agotado
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-3.5">
                  <p className="text-sm font-bold text-strong">{product.name}</p>
                  {product.brand && (
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-subtle">
                      {product.brand}
                    </p>
                  )}
                  {product.description && (
                    <p className="mt-1 text-xs text-muted">{product.description}</p>
                  )}

                  <p className="mt-2 text-lg font-bold text-brand-600">
                    {money(product.price, shop.currency)}
                  </p>

                  {product.trackStock && available.length > 0 && (
                    <div className="mt-2">
                      <p className="mb-1 text-[11px] text-subtle">Tallas disponibles</p>
                      <div className="flex flex-wrap gap-1.5">
                        {available.map((v) => (
                          <span
                            key={v.id}
                            className="rounded-lg border-2 border-edge bg-surface px-2 py-1 text-[11px] font-semibold text-body"
                          >
                            {variantLabel(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {link && !soldOut && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-success btn-sm mt-3 w-full justify-center"
                    >
                      <Icon name="whatsapp" className="h-4 w-4" />
                      Preguntar por esta
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-subtle">
        Precios sujetos a cambio. Escribenos para confirmar disponibilidad.
      </p>
    </div>
  );
}
