import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { money } from "@/lib/format";
import { logoUrl } from "@/lib/nav";
import { negocioTieneLogo } from "@/lib/imagenes";
import { tarifaDelTicket, ticketPorToken } from "@/lib/parqueadero";
import { cobroDe, duracionTexto, minutosEntre, numeroTicket, rangoTexto, tarifaEnPalabras } from "@/lib/parqueadero-tarifa";
import { fechaHora } from "@/lib/ticket-parqueadero";
import { toInternational, waLink } from "@/lib/whatsapp";
import { Icon } from "@/components/Icon";
import { RefrescoAutomatico } from "@/components/RefrescoAutomatico";
import { TiempoYCobro } from "@/components/parqueadero/TiempoYCobro";

export const dynamic = "force-dynamic";

// El ticket es de una persona: que no salga en buscadores.
export const metadata: Metadata = { title: "Tu ticket de parqueadero", robots: { index: false, follow: false } };

const EJEMPLOS = [
  { label: "1 hora", min: 60 },
  { label: "2 horas", min: 120 },
  { label: "4 horas", min: 240 },
  { label: "8 horas", min: 480 },
  { label: "Día completo", min: 1440 },
];

/**
 * Lo que abre el QR del ticket: cuanto tiempo lleva el vehiculo, cuanto va a
 * pagar, la tarifa y donde esta el parqueadero. Publica y sin sesion, como la
 * pagina de la mesa: se busca por el token del QR, que no se puede adivinar,
 * y no muestra el telefono ni el correo del cliente.
 */
export default async function TicketPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ticket = await ticketPorToken(String(token ?? "").slice(0, 60));
  if (!ticket) notFound();

  const shop = ticket.user;
  const tieneLogo = await negocioTieneLogo(ticket.userId);
  const logo = logoUrl(shop.slug, tieneLogo, shop.updatedAt);
  const tarifa = tarifaDelTicket(ticket);
  const enteredAt = ticket.enteredAt.toISOString();
  const mapa = shop.address
    ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(shop.address + ", " + shop.businessName)
    : null;
  const whatsapp = waLink(
    toInternational(shop.whatsappNumber || shop.phone, shop.whatsappNumber, shop.timezone),
    "Hola, tengo el ticket " + numeroTicket(ticket.seq) + " del vehículo " + ticket.plate + "."
  );

  return (
    <div className="min-h-dvh bg-panel">
      {ticket.status === "DENTRO" && <RefrescoAutomatico segundos={60} />}
      <header className="border-b border-line bg-panel/95 px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate font-display text-base text-strong">{shop.businessName}</p>
            <p className="text-xs text-muted">Ticket {numeroTicket(ticket.seq)}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-5">
        <section className="text-center">
          <p className="inline-block rounded-xl border-2 border-line-strong bg-surface px-4 py-2 font-display text-3xl tracking-[0.25em] text-strong">
            {ticket.plate}
          </p>
          <p className="mt-2 text-sm text-muted">
            {ticket.vehicleType} · entró {fechaHora(enteredAt, shop.timezone)}
          </p>
        </section>

        {ticket.status === "DENTRO" && (
          <TiempoYCobro enteredAt={enteredAt} tarifa={tarifa} currency={shop.currency} variante="grande" />
        )}

        {(ticket.status === "PAGADO" || ticket.status === "POR_COBRAR") && ticket.exitedAt && (
          <section
            className={
              "rounded-2xl border p-4 text-center " +
              (ticket.status === "PAGADO" ? "border-good-line bg-good-soft" : "border-warn-line bg-warn-soft")
            }
          >
            <p className="eyebrow">{ticket.status === "PAGADO" ? "Pagado" : "Pendiente por pagar"}</p>
            <p className="mt-1 font-display text-3xl text-strong">{money(ticket.amount ?? 0, shop.currency)}</p>
            <p className="mt-1 text-sm text-muted">
              Salió {fechaHora(ticket.exitedAt.toISOString(), shop.timezone)} ·{" "}
              {duracionTexto(minutosEntre(ticket.enteredAt, ticket.exitedAt))}
            </p>
          </section>
        )}

        {ticket.status === "ANULADO" && (
          <section className="rounded-2xl border border-bad-line bg-bad-soft p-4 text-center text-sm text-bad">
            Este ticket fue anulado. Si crees que es un error, comunícate con el parqueadero.
          </section>
        )}

        <section className="card">
          <h2 className="font-display text-[15px] text-strong">Tarifa {ticket.vehicleType.toLowerCase()}</h2>
          <ul className="mt-2 space-y-1 text-sm text-body">
            {tarifaEnPalabras(tarifa, shop.currency).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {rangoTexto(tarifa, shop.currency) && (
            <p className="mt-2 text-sm font-semibold text-strong">{rangoTexto(tarifa, shop.currency)}</p>
          )}
          <div className="mt-3 grid grid-cols-5 gap-1 text-center">
            {EJEMPLOS.map((e) => (
              <div key={e.min} className="rounded-lg bg-surface px-1 py-1.5">
                <p className="text-[10px] leading-tight text-subtle">{e.label}</p>
                <p className="text-xs font-bold text-strong">{money(cobroDe(tarifa, e.min), shop.currency)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card space-y-2 text-sm">
          <h2 className="font-display text-[15px] text-strong">Dónde está tu vehículo</h2>
          <p className="text-body">
            {shop.businessName}
            {shop.address ? " · " + shop.address : ""}
          </p>
          {ticket.spot && (
            <p className="text-body">
              Puesto: <b className="text-strong">{ticket.spot}</b>
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {mapa && (
              <a href={mapa} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                <Icon name="map" className="h-4 w-4" />
                Ver en el mapa
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-success btn-sm">
                <Icon name="whatsapp" className="h-4 w-4" />
                Escribir al parqueadero
              </a>
            )}
          </div>
        </section>

        <p className="pb-4 text-center text-xs text-subtle">
          El valor sube con el tiempo según la tarifa. Lo que pagas es lo que marque al momento de salir.
        </p>
      </main>
    </div>
  );
}
