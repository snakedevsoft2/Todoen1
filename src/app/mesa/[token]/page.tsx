import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { logoUrl, photoUrl } from "@/lib/nav";
import { PedidoMesaForm } from "@/components/PedidoMesaForm";
import { negocioTieneLogo, serviciosConFoto } from "@/lib/imagenes";

export const dynamic = "force-dynamic";

/**
 * Lo que abre el QR pegado en la mesa: el menu del negocio, para pedir sin
 * esperar a que alguien tome nota. Publica y sin sesion, como el portafolio.
 */
export default async function MesaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const mesa = await db.table.findUnique({
    where: { qrToken: token },
    select: { id: true, number: true, active: true, userId: true },
  });
  if (!mesa || !mesa.active) notFound();

  const shop = await db.user.findUnique({
    where: { id: mesa.userId },
    select: { businessName: true, slug: true, currency: true, updatedAt: true },
  });
  if (!shop) notFound();

  const productos = await db.service.findMany({
    where: { userId: mesa.userId, active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, name: true, price: true, category: true, description: true, updatedAt: true },
  });

  const items = productos.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    category: p.category,
    photo: photoUrl(p.id, conFoto.has(p.id), p.updatedAt),
    description: p.description,
  }));

  const [tieneLogo, conFoto] = await Promise.all([
    negocioTieneLogo(mesa.userId),
    serviciosConFoto({ userId: mesa.userId, active: true }),
  ]);
  const logo = logoUrl(shop.slug, tieneLogo, shop.updatedAt);

  return (
    <div className="min-h-dvh bg-panel">
      <header className="sticky top-0 z-40 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate font-display text-base text-strong">{shop.businessName}</p>
            <p className="text-xs text-muted">Pedido para la Mesa {mesa.number}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4">
        <PedidoMesaForm token={token} mesaNumero={mesa.number} items={items} currency={shop.currency} />
      </main>
    </div>
  );
}
