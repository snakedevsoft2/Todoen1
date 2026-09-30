import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { logoUrl } from "@/lib/nav";
import { qrSvg } from "@/lib/qr";
import { toInternational } from "@/lib/whatsapp";
import { esDueno, puedeHacer } from "@/lib/permisos-empleado";
import { datosDelTicket, origenDeLaPeticion, rutaPublicaDelTicket, tarifaDelTicket } from "@/lib/parqueadero";
import { duracionTexto, minutosEntre, numeroTicket, rangoTexto, tarifaEnPalabras } from "@/lib/parqueadero-tarifa";
import { fechaHora } from "@/lib/ticket-parqueadero";
import { anularTicketAction } from "@/actions/parqueadero";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { TicketAcciones } from "@/components/parqueadero/TicketAcciones";
import { SalidaVehiculoForm } from "@/components/parqueadero/SalidaVehiculoForm";
import { TiempoYCobro } from "@/components/parqueadero/TiempoYCobro";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, { label: string; tone: "blue" | "green" | "amber" | "red" }> = {
  DENTRO: { label: "Adentro", tone: "blue" },
  PAGADO: { label: "Pagado", tone: "green" },
  POR_COBRAR: { label: "Pendiente por pagar", tone: "amber" },
  ANULADO: { label: "Anulado", tone: "red" },
};

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const { user, staff: me } = await requireSession();
  if (user.businessType !== "PARQUEADERO") redirect("/panel");
  const { id } = await params;
  const { nuevo } = await searchParams;

  const ticket = await db.parkingTicket.findFirst({
    where: { id, userId: user.id },
    include: {
      receivedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      sale: { select: { id: true, paymentMethod: true, day: true } },
    },
  });
  if (!ticket) notFound();

  const origen = await origenDeLaPeticion();
  const data = datosDelTicket(ticket, user, origen, logoUrl(user.slug, user.hasLogo, user.updatedAt));
  const tarifa = tarifaDelTicket(ticket);
  const estado = ESTADO[ticket.status];
  const abierto = ticket.status === "DENTRO" || ticket.status === "POR_COBRAR";
  const waNumero = ticket.phone ? toInternational(ticket.phone, user.whatsappNumber, user.timezone) : null;

  return (
    <>
      <PageHeader title={"Ticket " + numeroTicket(ticket.seq)} subtitle={ticket.vehicleType + " · " + ticket.plate}>
        <Link href="/panel/parqueadero" className="btn-ghost btn-sm">
          Volver al parqueadero
        </Link>
      </PageHeader>

      {nuevo && ticket.status === "DENTRO" && (
        <div className="mb-4">
          <Alert kind="ok">Vehículo ingresado. Imprime el ticket o mándaselo al cliente.</Alert>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex flex-col items-center text-center">
            <Badge tone={estado.tone}>{estado.label}</Badge>
            <p className="mt-3 rounded-xl border-2 border-line-strong bg-surface px-4 py-2 font-display text-3xl tracking-[0.25em] text-strong">
              {ticket.plate}
            </p>
            <p className="mt-2 text-sm text-muted">
              {ticket.vehicleType}
              {ticket.spot ? " · " + ticket.spot : ""}
            </p>

            {ticket.status === "DENTRO" && (
              <>
                <div
                  className="mt-4 w-48 rounded-xl border border-line bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
                  data-qr-ticket
                  dangerouslySetInnerHTML={{ __html: qrSvg(data.url, { size: 220 }) }}
                />
                <p className="mt-2 max-w-xs text-xs text-subtle">
                  El cliente escanea este QR y ve cuánto tiempo lleva y cuánto va a pagar.
                </p>
              </>
            )}

            <div className="mt-4 flex w-full justify-center">
              <TicketAcciones data={data} waNumero={waNumero} email={ticket.email} />
            </div>
            <Link
              href={rutaPublicaDelTicket(ticket.qrToken)}
              target="_blank"
              className="mt-3 text-xs font-semibold text-brand-700 hover:underline"
            >
              Ver lo que ve el cliente
            </Link>
          </div>
        </Card>

        <div className="space-y-5">
          {ticket.status === "DENTRO" && (
            <TiempoYCobro enteredAt={ticket.enteredAt.toISOString()} tarifa={tarifa} currency={user.currency} variante="grande" />
          )}

          {abierto && (
            <Card title={ticket.status === "DENTRO" ? "Dar salida" : "Registrar el pago"}>
              <SalidaVehiculoForm
                ticketId={ticket.id}
                enteredAt={ticket.enteredAt.toISOString()}
                tarifa={tarifa}
                currency={user.currency}
                debe={ticket.status === "POR_COBRAR" ? (ticket.amount ?? 0) : null}
                puedeCambiarValor={esDueno(me.role)}
              />
            </Card>
          )}

          <Card title="Detalle">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-subtle">Entrada</dt>
              <dd className="text-strong">{fechaHora(ticket.enteredAt.toISOString(), user.timezone)}</dd>
              {ticket.exitedAt && (
                <>
                  <dt className="text-subtle">Salida</dt>
                  <dd className="text-strong">
                    {fechaHora(ticket.exitedAt.toISOString(), user.timezone)} ·{" "}
                    {duracionTexto(minutosEntre(ticket.enteredAt, ticket.exitedAt))}
                  </dd>
                </>
              )}
              {ticket.amount != null && (
                <>
                  <dt className="text-subtle">{ticket.status === "POR_COBRAR" ? "Debe" : "Cobrado"}</dt>
                  <dd className="font-bold text-strong">
                    {money(ticket.amount, user.currency)}
                    {ticket.sale ? " · " + ticket.sale.paymentMethod.toLowerCase() : ""}
                  </dd>
                </>
              )}
              <dt className="text-subtle">Tarifa</dt>
              <dd className="text-strong">
                {tarifaEnPalabras(tarifa, user.currency).join(" · ")}
                <span className="block text-xs text-subtle">{rangoTexto(tarifa, user.currency)}</span>
              </dd>
              {ticket.phone && (
                <>
                  <dt className="text-subtle">Teléfono</dt>
                  <dd className="text-strong">{ticket.phone}</dd>
                </>
              )}
              {ticket.email && (
                <>
                  <dt className="text-subtle">Correo</dt>
                  <dd className="text-strong [overflow-wrap:anywhere]">{ticket.email}</dd>
                </>
              )}
              {ticket.receivedBy && (
                <>
                  <dt className="text-subtle">Lo recibió</dt>
                  <dd className="text-strong">{ticket.receivedBy.name}</dd>
                </>
              )}
              {ticket.closedBy && (
                <>
                  <dt className="text-subtle">Le dio salida</dt>
                  <dd className="text-strong">{ticket.closedBy.name}</dd>
                </>
              )}
            </dl>
          </Card>

          {abierto && puedeHacer(me.role, "anularTicketAction") && (
            <form action={anularTicketAction} className="text-right">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <SubmitButton
                className="btn-danger btn-sm"
                pendingText="Anulando..."
                confirm="¿Anular este ticket? No cuenta como venta ni como pendiente."
              >
                <Icon name="trash" className="h-4 w-4" />
                Anular ticket
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
