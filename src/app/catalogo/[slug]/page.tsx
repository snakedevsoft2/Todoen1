import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  Fraunces,
  Plus_Jakarta_Sans,
  Fredoka,
  Nunito_Sans,
  Playfair_Display,
  Jost,
  Oswald,
  Inter,
  Cormorant,
  Manrope,
  Quicksand,
  Anton,
  Poppins,
} from "next/font/google";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { ITEM_NOUN, coverUrl, logoUrl, photoUrl } from "@/lib/nav";
import { variantLabel } from "@/lib/variants";
import { normalizePhone, toInternational } from "@/lib/whatsapp";
import { APP_NAME } from "@/lib/brand";
import { resolverFondo } from "@/lib/fondos";
import { plantillaDe } from "@/lib/plantillas";
import { themeCss } from "@/lib/theme";
import { aiEnabled } from "@/lib/ai";
import { configDe, saludoDe } from "@/lib/agente";
import { ChatAgente } from "@/components/ChatAgente";
import { Icon } from "@/components/Icon";
import { ThemeStyle } from "@/components/ThemeStyle";
import { BrandMark } from "@/components/BrandMark";
import {
  PortfolioOrder,
  type PortfolioItem,
  type Wholesale,
} from "@/components/PortfolioOrder";
import { ordenDeCategorias } from "@/lib/categorias-negocio";
import { negocioTieneLogo, negocioTienePortada, serviciosConFoto } from "@/lib/imagenes";

export const dynamic = "force-dynamic";

/**
 * Tipografia propia del catalogo publico, aparte de la del panel.
 *
 * Fraunces (serif con caracter) para titulos, nombre y precio de cada
 * producto: se ve artesanal y apetitoso, justo lo que un catalogo necesita
 * para no sentirse una hoja de calculo. Plus Jakarta Sans para el resto del
 * texto, bien legible en celular. Solo se cargan aqui: el panel sigue con
 * Archivo tal como esta hoy.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-catalogo-display",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-catalogo-body",
  display: "swap",
});

/**
 * El resto de las fuentes de las plantillas (lib/plantillas.ts). Cada una
 * declarada aparte porque next/font/google exige llamadas literales en el
 * modulo: no se puede armar en un bucle. No pesa nada de mas: el navegador
 * solo pide el archivo de la que la plantilla activa de verdad usa.
 */
const fredoka = Fredoka({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-plantilla-polaroid-display", display: "swap" });
const nunitoSans = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-plantilla-amigable-body", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-plantilla-editorial-display", display: "swap" });
const jost = Jost({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plantilla-editorial-body", display: "swap" });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-plantilla-industrial-display", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plantilla-industrial-body", display: "swap" });
const cormorant = Cormorant({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-plantilla-nocturna-display", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plantilla-nocturna-body", display: "swap" });
const quicksand = Quicksand({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-plantilla-botanica-display", display: "swap" });
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-plantilla-promo-display", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plantilla-promo-body", display: "swap" });

/** Todas las variables de fuente juntas, para sumarlas al className del wrapper. */
const CLASES_FUENTES = [
  fraunces,
  plusJakarta,
  fredoka,
  nunitoSans,
  playfair,
  jost,
  oswald,
  inter,
  cormorant,
  manrope,
  quicksand,
  anton,
  poppins,
]
  .map((f) => f.variable)
  .join(" ");

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

  const titulo = shop.publicHeadline || shop.businessName;
  const descripcion =
    shop.publicAbout ?? shop.tagline ?? "Mira el catálogo de " + shop.businessName + " y pide por WhatsApp.";

  // Lo que WhatsApp, Facebook e Instagram leen para armar la tarjeta del
  // enlace. La imagen no va aqui: la pone opengraph-image.tsx, que Next suma
  // sola a estos datos.
  return {
    title: titulo + " - Portafolio",
    description: descripcion,
    openGraph: {
      title: titulo,
      description: descripcion,
      type: "website",
      siteName: shop.businessName,
      locale: "es_CO",
    },
    twitter: { card: "summary_large_image", title: titulo, description: descripcion },
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

  // Sin las dos imagenes: el logo y la portada se sirven por su propia
  // direccion (/logo y /portada), que el navegador cachea. Traerlas aqui era
  // meter cientos de KB dentro del HTML en cada visita. Ver lib/imagenes.ts.
  const shop = await db.user.findUnique({
    where: { slug },
    omit: { logo: true, publicCover: true },
  });
  if (!shop) notFound();
  const [tieneLogo, tienePortada] = await Promise.all([
    negocioTieneLogo(shop.id),
    negocioTienePortada(shop.id),
  ]);

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
    // Sin el data URL de la foto: de ella solo se necesita si existe, y eso lo
    // dice `conFoto` sin mover los bytes. Ver lib/imagenes.ts.
    omit: { image: true },
    include: {
      variants: {
        where: { active: true },
        orderBy: [{ size: "asc" }, { color: "asc" }],
      },
      views: { orderBy: { angle: "asc" }, select: { id: true } },
    },
  });

  const conFoto = await serviciosConFoto({ userId: shop.id, active: true, showcase: true });

  const ordenCategorias = await ordenDeCategorias(shop.id);

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
  const tieneAgenda = esBarberia || shop.businessType === "LAVADERO";
  // Con indicativo del pais: un numero local (0982...) no abre el chat.
  const whatsapp = toInternational(shop.whatsappNumber || shop.phone, shop.whatsappNumber, shop.timezone);
  const cover = coverUrl(shop.slug, tienePortada, shop.updatedAt);

  const items: PortfolioItem[] = productos.map((p) => {
    const conStock = p.variants.filter((v) => v.stock > 0);
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      category: p.category,
      photo: photoUrl(p.id, conFoto.has(p.id), p.updatedAt),
      // Frente + las vistas de la IA, solo si el producto tiene foto y las tres vistas.
      giro:
        conFoto.has(p.id) && p.views.length === 3
          ? [photoUrl(p.id, true, p.updatedAt)!, ...p.views.map((v) => "/vista/" + v.id)]
          : undefined,
      description: p.description,
      brand: p.brand,
      variants: conStock.map((v) => ({ id: v.id, label: variantLabel(v) })),
      // Solo esta agotado si lleva inventario y no quedo ninguna talla.
      soldOut: p.trackStock && p.variants.length > 0 && conStock.length === 0,
      createdAt: p.createdAt.getTime(),
    };
  });

  const categories = [...new Set(items.map((i) => i.category))].sort();
  const plantilla = plantillaDe(shop.catalogTemplate);

  if (!shop.publicOpen && !esSuya) {
    return (
      <div
        className={
          CLASES_FUENTES +
          " catalogo-tema mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 text-center"
        }
        data-plantilla={plantilla.key}
      >
        <ThemeStyle brandColor={shop.brandColor} theme={shop.theme} />
        {plantilla.accent && (
          <style
            dangerouslySetInnerHTML={{
              __html: themeCss(plantilla.accent, plantilla.scheme, '.catalogo-tema[data-plantilla="' + plantilla.key + '"]'),
            }}
          />
        )}
        <BrandMark
          name={shop.businessName}
          logo={logoUrl(shop.slug, tieneLogo, shop.updatedAt)}
          size="xl"
          className="mx-auto"
        />
        <h1 className="mt-4 font-display text-2xl text-strong">{shop.businessName}</h1>
        <p className="mt-2 text-sm text-muted">
          El portafolio no está disponible por ahora. Escríbenos directamente.
        </p>
        {shop.phone && (
          <p className="mt-2 text-sm font-semibold text-brand-600">{shop.phone}</p>
        )}
      </div>
    );
  }

  // Fondo de pagina de pagos: color solido o portada difuminada, y todo el
  // contenido en una tarjeta encima. "Clasico" es la pagina de siempre.
  const fondo = resolverFondo(shop.publicBackground, shop.brandColor, cover);
  const enTarjeta = fondo.enTarjeta;
  // Con la portada de fondo no se repite la franja de arriba: ya esta detras de
  // todo, y ponerla dos veces duplicaria la foto dentro de la pagina.
  const franja = cover && fondo.key !== "foto";

  // El agente de IA sale solo si el dueño lo prendio y el servidor tiene la
  // clave del modelo: una burbuja que contesta "no disponible" es peor que nada.
  const agente = aiEnabled() ? await configDe(shop.id) : null;

  return (
    <div
      className={CLASES_FUENTES + " catalogo-tema relative min-h-dvh"}
      data-fondo={fondo.key}
      data-plantilla={plantilla.key}
      style={enTarjeta && !fondo.foto ? { backgroundColor: fondo.color } : undefined}
    >
      <ThemeStyle brandColor={shop.brandColor} theme={shop.theme} />
      {plantilla.accent && (
        <style
          dangerouslySetInnerHTML={{
            __html: themeCss(plantilla.accent, plantilla.scheme, '.catalogo-tema[data-plantilla="' + plantilla.key + '"]'),
          }}
        />
      )}

      {fondo.foto && (
        <div aria-hidden="true" className="fixed inset-0 z-0 overflow-hidden" style={{ backgroundColor: fondo.color }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fondo.foto} alt="" className="h-full w-full scale-110 object-cover blur-2xl" />
          <div className="absolute inset-0 bg-black/45" />
        </div>
      )}

      {/* Aviso de borrador: solo lo ve el dueno, nunca un cliente. */}
      {enBorrador && (
        <div className="sticky top-0 z-40 border-b border-line bg-warn-soft px-4 py-2.5">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warn">
            <Icon name="alert" className="h-4 w-4 shrink-0" />
            <span className="font-bold">Así se verá tu página.</span>
            <span>Todavía no está lanzada: solo tú la ves.</span>
            <Link href="/panel/portafolio" className="link ml-auto font-bold">
              Lanzarla
            </Link>
          </div>
        </div>
      )}

      <div className={enTarjeta ? "relative z-10 mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 sm:py-10" : ""}>
      <div className={enTarjeta ? "overflow-hidden rounded-3xl border border-line/60 bg-panel shadow-soft-lg" : ""}>
      {/* Portada */}
      <header className="border-b border-line">
        {franja && (
          <div className="relative h-40 w-full overflow-hidden border-b border-line sm:h-56">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" className="h-full w-full object-cover" />
          </div>
        )}

        <div className="mx-auto w-full max-w-5xl px-4 py-7 text-center">
          {/* relative z-10: la franja de portada es "relative", y sin esto se
              pinta ENCIMA del logo y le tapa la mitad de arriba. */}
          <div
            className={"relative z-10 mx-auto flex justify-center " + (franja ? "-mt-16 sm:-mt-20" : "")}
          >
            <BrandMark
              name={shop.businessName}
              logo={logoUrl(shop.slug, tieneLogo, shop.updatedAt)}
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
            {tieneAgenda && shop.bookingOpen && (
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
            {/* Sin "publicados" pegado al sustantivo: con "prendas" o "cortes"
                el genero no concuerda para todos los oficios. */}
            <p className="font-display text-base text-body">Todavía no hay nada publicado aquí.</p>
            <p className="mt-1 text-xs text-subtle">Vuelve pronto o escríbenos directamente.</p>
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
            ordenCategorias={ordenCategorias}
            deliveryEnabled={shop.deliveryEnabled}
            deliveryFee={shop.deliveryFee}
            codPayment={shop.codPayment}
            onlinePayment={shop.onlinePayment}
            template={plantilla.key}
            agenda={tieneAgenda}
            slug={slug}
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
      </div>
      {agente?.webOn && (
        <ChatAgente
          endpoint={"/api/agente/" + shop.slug}
          negocio={shop.businessName}
          saludo={saludoDe(shop, agente)}
          almacen={shop.slug}
        />
      )}
    </div>
  );
}
