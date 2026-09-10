import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { ITEM_NOUN, logoUrl, photoUrl } from "@/lib/nav";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { CopyLink } from "@/components/CopyLink";
import { Icon } from "@/components/Icon";
import { PortfolioForm } from "@/components/PortfolioForm";
import { WholesaleForm } from "@/components/WholesaleForm";

export const dynamic = "force-dynamic";

export default async function PortafolioPage() {
  const { user } = await requireOwner();
  const noun = ITEM_NOUN[user.businessType];
  const ruta = "/catalogo/" + user.slug;

  const [publicados, sinFoto, total, muestra, tiers] = await Promise.all([
    db.service.count({ where: { userId: user.id, active: true, showcase: true } }),
    db.service.count({ where: { userId: user.id, active: true, showcase: true, image: null } }),
    db.service.count({ where: { userId: user.id, active: true } }),
    // Los primeros items, solo para la vista previa.
    db.service.findMany({
      where: { userId: user.id, active: true, showcase: true },
      orderBy: [{ image: "desc" }, { category: "asc" }, { name: "asc" }],
      take: 4,
      select: { id: true, name: true, price: true, image: true, updatedAt: true },
    }),
    db.wholesaleTier.findMany({
      where: { userId: user.id },
      orderBy: { minQty: "asc" },
      select: { id: true, minQty: true, percentOff: true, label: true },
    }),
  ]);

  // Un precio de verdad del catalogo para el ejemplo de cada escala. Con uno
  // inventado el dueno no sabe si el descuento le sirve o no.
  const samplePrice = muestra.find((m) => m.price > 0)?.price ?? null;

  return (
    <>
      <PageHeader
        title="Mi portafolio"
        subtitle="La pagina que compartes con tus clientes por enlace o por QR"
      >
        {/* Sin lanzar, la pagina completa la ve solo el dueno: sirve de
            ensayo antes de compartir el enlace. */}
        <Link href={ruta} target="_blank" className="btn-primary btn-sm">
          <Icon name="link" className="h-4 w-4" />
          {user.publicOpen ? "Ver como lo ven" : "Ver como quedaria"}
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Estado"
          value={user.publicOpen ? "Publicado" : "Apagado"}
          hint={user.publicOpen ? "Cualquiera con el enlace lo ve" : "Solo salen tus datos"}
          tone={user.publicOpen ? "good" : "bad"}
        />
        <Stat
          label={"En el portafolio"}
          value={String(publicados)}
          hint={"de " + total + " " + noun.plural + " activos"}
          tone="brand"
        />
        <Stat
          label="Sin foto"
          value={String(sinFoto)}
          hint={sinFoto === 0 ? "Todo con foto" : "Se ven vacios"}
          tone={sinFoto > 0 ? "amber" : "good"}
        />
        <Stat
          label="Precios"
          value={user.publicShowPrices ? "Visibles" : "Ocultos"}
          hint="Se cambia abajo"
        />
      </div>

      {publicados === 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border-2 border-edge bg-warn-soft px-4 py-3 text-sm text-warn">
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          <span>
            Tu portafolio esta vacio. Marca tus {noun.plural} con{" "}
            <strong>Mostrar en mi portafolio</strong>.
          </span>
          <Link href="/panel/catalogo" className="link ml-auto">
            Ir a mis {noun.plural}
          </Link>
        </div>
      )}

      <div className="mt-5">
        <Card
          title="Arma tu pagina"
          subtitle="Lo que escribas se ve al instante en el celular de al lado"
        >
          <PortfolioForm
            initial={{
              publicOpen: user.publicOpen,
              publicShowPrices: user.publicShowPrices,
              publicHeadline: user.publicHeadline,
              publicAbout: user.publicAbout,
              publicOrderNote: user.publicOrderNote,
              publicCover: user.publicCover,
            }}
            businessName={user.businessName}
            itemPlural={noun.plural}
            preview={{
              tagline: user.tagline,
              logo: logoUrl(user.slug, user.logo, user.updatedAt),
              brandColor: user.brandColor,
              phone: user.phone,
              address: user.address,
              showBooking: user.businessType === "BARBERIA" && user.bookingOpen,
              currency: user.currency,
              items: muestra.map((m) => ({
                id: m.id,
                name: m.name,
                price: m.price,
                photo: photoUrl(m.id, m.image, m.updatedAt),
              })),
            }}
          />
        </Card>
      </div>

      <div className="mt-5">
        <Card
          title="Promociones al por mayor"
          subtitle="El apartado del catalogo para quien te compra en cantidad"
        >
          <WholesaleForm
            initial={{
              wholesaleOpen: user.wholesaleOpen,
              wholesaleTitle: user.wholesaleTitle,
              wholesaleNote: user.wholesaleNote,
            }}
            tiers={tiers}
            currency={user.currency}
            itemSingular={noun.singular}
            itemPlural={noun.plural}
            samplePrice={samplePrice}
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Tu enlace" subtitle="El que mandas por WhatsApp o pones en tu perfil">
            <p className="break-all rounded-xl border-2 border-edge bg-surface px-3 py-2.5 text-sm text-body">
              {ruta}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyLink path={ruta} />
              <Link href={ruta} target="_blank" className="btn-ghost btn-sm">
                <Icon name="link" className="h-4 w-4" />
                Abrir
              </Link>
            </div>
            <p className="mt-3 text-xs text-subtle">
              El nombre del enlace se cambia en Ajustes.
            </p>
        </Card>

        <Card title="Tu codigo QR" subtitle="Para la vitrina, el mostrador o una tarjeta">
            <div className="flex justify-center rounded-xl border-2 border-edge bg-white p-4">
              {/* El QR se arma en el servidor y sale como vector: se puede
                  imprimir del tamano que sea sin que se pixele. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={"/qr/" + user.slug}
                alt={"Codigo QR de " + user.businessName}
                className="h-44 w-44"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={"/qr/" + user.slug + "?descargar=1"} className="btn-ghost btn-sm">
                <Icon name="download" className="h-4 w-4" />
                Descargar
              </a>
              <a href={"/qr/" + user.slug} target="_blank" rel="noopener" className="btn-ghost btn-sm">
                <Icon name="print" className="h-4 w-4" />
                Abrir para imprimir
              </a>
            </div>
            <p className="mt-3 text-xs text-subtle">
              Quien lo escanee llega directo a tu portafolio.
            </p>
        </Card>

        <Card title="Para que se vea bien">
            {publicados > 0 && sinFoto === 0 ? (
              <Empty
                title="Tu portafolio esta completo"
                hint="Todos tus items publicados tienen foto."
              />
            ) : (
              <ul className="space-y-2.5 text-sm text-body">
                <li className="flex gap-2">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                  Ponle foto a cada uno de tus {noun.plural}: es lo que hace que el cliente pida.
                </li>
                <li className="flex gap-2">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                  Sube una portada del local y escribe dos lineas de presentacion.
                </li>
                <li className="flex gap-2">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                  Revisa que tu numero de WhatsApp este puesto, o el pedido no llega a ninguna
                  parte.
                </li>
              </ul>
            )}
        </Card>
      </div>
    </>
  );
}
