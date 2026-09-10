import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { ITEM_NOUN, logoUrl, photoUrl } from "@/lib/nav";
import { variantLabel } from "@/lib/variants";
import { normalizePhone } from "@/lib/whatsapp";
import { APP_NAME } from "@/lib/brand";
import { Icon } from "@/components/Icon";
import { ThemeStyle } from "@/components/ThemeStyle";
import { BrandMark } from "@/components/BrandMark";
import {
  PortfolioOrder,
  type PortfolioItem,
  type Wholesale,
} from "@/components/PortfolioOrder";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const shop = await db.user.findUnique({
    where: { slug },
    select: { businessName: true, tagline: true, publicHeadline: true, publicAbout: true },
  });
  if (!shop) return { title: "Portafolio" };
  return {
    title: (shop.publicHeadline || shop.businessName) + " - Portafolio",
    description: shop.publicAbout ?? shop.tagline ?? undefined,
  };
}

/**
 * Portafolio publico del negocio.
 *
 * Es la pagina que se comparte por enlace o por QR: quien la abre ve lo que el
 * negocio vende, con foto y precio, arma su pedido y lo manda por WhatsApp. La
 * tienen los cuatro tipos de negocio; la barberia ademas manda a su agenda para
 * separar el turno.
 */
export default async function PortafolioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const shop = await db.user.findUnique({ where: { slug } });
  if (!shop) notFound();

  // El dueno puede ver su pagina completa aunque todavia no la haya lanzado:
  // es la unica forma de revisar como queda de verdad antes de publicarla.
  // Comparamos contra el negocio de la sesion, no contra el slug, para que
  // nadie vea el borrador de otro.
  const sesion = await getCurrentSession();
  const esSuya = sesion?.user.id === shop.id;
  const enBorrador = !shop.publicOpen && esSuya;

  const productos = await db.service.findMany({
    where: { userId: shop.id, active: true, showcase: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      variants: {
        where: { active: true },
        orderBy: [{ size: "asc" }, { color: "asc" }],
      },
    },
  });

  // Escalas del mayorista. Solo se consultan si el negocio encendio el
  // apartado: quien vende al detal no tiene por que pagar una consulta mas.
  const tiers = shop.wholesaleOpen
    ? await db.wholesaleTier.findMany({
        where: { userId: shop.id },
        orderBy: { minQty: "asc" },
        select: { id: true, minQty: true, percentOff: true, label: true },
      })
    : [];

  const wholesale: Wholesale | null =
    tiers.length > 0
      ? {
          title: shop.wholesaleTitle || "Precios al por mayor",
          note: shop.wholesaleNote,
          tiers,
        }
      : null;

  const noun = ITEM_NOUN[shop.businessType];
  const esBarberia = shop.businessType === "BARBERIA";
  const whatsapp = normalizePhone(shop.whatsappNumber) ?? normalizePhone(shop.phone);
  const cover = shop.publicCover;

  const items: PortfolioItem[] = productos.map((p) => {
    const conStock = p.variants.filter((v) => v.stock > 0);
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      category: p.category,
      photo: photoUrl(p.id, p.image, p.updatedAt),
      description: p.description,
      brand: p.brand,
      variants: conStock.map((v) => ({ id: v.id, label: variantLabel(v) })),
      // Solo esta agotado si lleva inventario y no quedo ninguna talla.
      soldOut: p.trackStock && p.variants.length > 0 && conStock.length === 0,
    };
  });

  const categories = [...new Set(items.map((i) => i.category))].sort();

  if (!shop.publicOpen && !esSuya) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 text-center">
        <ThemeStyle brandColor={shop.brandColor} theme={shop.theme} />
        <BrandMark
          name={shop.businessName}
          logo={logoUrl(shop.slug, shop.logo, shop.updatedAt)}
          size="xl"
          className="mx-auto"
        />
        <h1 className="mt-4 font-display text-2xl text-strong">{shop.businessName}</h1>
        <p className="mt-2 text-sm text-muted">
          El portafolio no esta disponible por ahora. Escribenos directamente.
        </p>
        {shop.phone && (
          <p className="mt-2 text-sm font-semibold text-brand-600">{shop.phone}</p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <ThemeStyle brandColor={shop.brandColor} theme={shop.theme} />

      {/* Aviso de borrador: solo lo ve el dueno, nunca un cliente. */}
      {enBorrador && (
        <div className="sticky top-0 z-40 border-b border-line bg-warn-soft px-4 py-2.5">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warn">
            <Icon name="alert" className="h-4 w-4 shrink-0" />
            <span className="font-bold">Asi se vera tu pagina.</span>
            <span>Todavia no esta lanzada: solo tu la ves.</span>
            <Link href="/panel/portafolio" className="link ml-auto font-bold">
              Lanzarla
            </Link>
          </div>
        </div>
      )}

      {/* Portada */}
      <header className="border-b border-line">
        {cover && (
          <div className="relative h-40 w-full overflow-hidden border-b border-line sm:h-56">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" className="h-full w-full object-cover" />
          </div>
        )}

        <div className="mx-auto w-full max-w-5xl px-4 py-7 text-center">
          <div className={"mx-auto flex justify-center " + (cover ? "-mt-16 sm:-mt-20" : "")}>
            <BrandMark
              name={shop.businessName}
              logo={logoUrl(shop.slug, shop.logo, shop.updatedAt)}
              size="xl"
            />
          </div>

          <h1 className="mt-4 font-display text-[30px] leading-none tracking-tight text-strong sm:text-[40px]">
            {shop.publicHeadline || shop.businessName}
          </h1>

          {shop.tagline && <p className="mt-2 text-sm font-semibold text-brand-600">{shop.tagline}</p>}

          {shop.publicAbout && (
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-body">
              {shop.publicAbout}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-subtle">
            {shop.address && (
              <span>
                <Icon name="home" className="mr-1 inline h-3 w-3" />
                {shop.address}
              </span>
            )}
            {shop.phone && (
              <span>
                <Icon name="phone" className="mr-1 inline h-3 w-3" />
                {shop.phone}
              </span>
            )}
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {esBarberia && shop.bookingOpen && (
              <Link href={"/reservar/" + slug} className="btn-primary">
                <Icon name="calendar" className="h-4 w-4" />
                Separar mi turno
              </Link>
            )}
            {wholesale && (
              <a href="#mayoristas" className="btn-ghost">
                <Icon name="tag" className="h-4 w-4" />
                Compro al por mayor
              </a>
            )}
            {whatsapp && (
              <a
                href={
                  "https://wa.me/" +
                  whatsapp +
                  "?text=" +
                  encodeURIComponent("Hola " + shop.businessName + ", vi tu portafolio.")
                }
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                <Icon name="whatsapp" className="h-4 w-4" />
                Escribirnos
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        {items.length === 0 ? (
          <div className="card text-center">
            <p className="font-display text-base text-body">
              Todavia no hay {noun.plural} publicados.
            </p>
            <p className="mt-1 text-xs text-subtle">Vuelve pronto o escribenos directamente.</p>
          </div>
        ) : (
          <PortfolioOrder
            items={items}
            categories={categories}
            currency={shop.currency}
            whatsapp={whatsapp}
            businessName={shop.businessName}
            showPrices={shop.publicShowPrices}
            itemNoun={noun.plural}
            orderNote={shop.publicOrderNote}
            wholesale={wholesale}
          />
        )}
      </main>

      <footer className="border-t border-line py-6 text-center">
        <p className="text-[11px] text-subtle">
          Precios sujetos a cambio. Escribenos para confirmar disponibilidad.
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-subtle">
          Hecho con {APP_NAME}
        </p>
      </footer>
    </div>
  );
}
