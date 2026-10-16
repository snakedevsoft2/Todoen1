import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isValidDay, todayIn } from "@/lib/dates";
import { aCampo, money, prettyDay, shortDay } from "@/lib/format";
import { formatReceiptSeq } from "@/lib/receipt-seq";
import { avisoBorrarVehiculo } from "@/lib/impacto-borrado";
import { tieneFacturaEmitida } from "@/lib/borrar-registros";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { FormSinSenal } from "@/components/SinSenal";
import { BotonBorrar } from "@/components/BotonBorrar";
import { cambiarPrecioLavadoAction, deleteWashJobAction, updateWashJobAction } from "@/actions/lavadero";

export const dynamic = "force-dynamic";

const ESTADO_LABEL: Record<string, string> = {
  EN_COLA: "En cola",
  LAVANDO: "Lavando",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  POR_COBRAR: "Pendiente",
  CANCELADO: "Cancelado",
};
const ESTADO_TONO: Record<string, "amber" | "blue" | "green" | "red"> = {
  EN_COLA: "amber",
  LAVANDO: "blue",
  LISTO: "blue",
  ENTREGADO: "green",
  POR_COBRAR: "amber",
  CANCELADO: "red",
};
const PAGO: Record<string, string> = {
  EFECTIVO: "efectivo",
  TARJETA: "tarjeta",
  TRANSFERENCIA: "transferencia",
  OTRO: "otro",
};

/**
 * Todos los vehiculos que entraron al lavadero, en cualquier estado: los del
 * patio, los ya cobrados, los pendientes de pago y los cancelados. Solo la
 * dueña: aqui corrige los datos y el precio de cualquiera, y lo borra (con su
 * venta, si ya se cobro), viendo antes que cambia si lo borra.
 */
export default async function HistorialPatioPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; q?: string }>;
}) {
  const { user } = await requireOwner();
  if (user.businessType !== "LAVADERO") redirect("/panel");

  const sp = await searchParams;
  const today = todayIn(user.timezone);
  const day = sp.d && isValidDay(sp.d) ? sp.d : today;
  // Buscar por placa, cliente o celular mira todos los dias, no solo uno.
  const q = (sp.q ?? "").trim().slice(0, 40);

  const [jobs, services] = await Promise.all([
    db.washJob.findMany({
      where: q
        ? {
            userId: user.id,
            OR: [
              { vehiclePlate: { contains: q, mode: "insensitive" } },
              { clientName: { contains: q, mode: "insensitive" } },
              { clientPhone: { contains: q } },
            ],
          }
        : { userId: user.id, day },
      orderBy: { createdAt: "desc" },
      take: q ? 50 : 300,
      include: {
        sale: {
          select: {
            id: true,
            total: true,
            paymentMethod: true,
            day: true,
            receiptSeq: true,
            electronicInvoice: { select: { status: true } },
          },
        },
        assignedStaff: { select: { name: true, color: true, commissionPct: true } },
        receivedBy: { select: { name: true } },
      },
    }),
    db.service.findMany({
      where: { userId: user.id, active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, price: true },
    }),
  ]);

  // Para el aviso antes de borrar: que ventas dieron sello y que dias ya tienen la caja cerrada.
  const ventas = jobs.flatMap((j) => (j.sale ? [j.sale] : []));
  const [selladas, cierres] = await Promise.all([
    db.loyaltyStamp.findMany({ where: { userId: user.id, saleId: { in: ventas.map((v) => v.id) } }, select: { saleId: true } }),
    db.cashClosure.findMany({
      where: { userId: user.id, day: { in: [...new Set(ventas.map((v) => v.day))] } },
      select: { day: true },
    }),
  ]);
  const conSello = new Set(selladas.map((x) => x.saleId));
  const diasCerrados = new Set(cierres.map((c) => c.day));

  const activos = jobs.filter((j) => j.status !== "CANCELADO");
  const cobrado = jobs.reduce((s, j) => s + (j.sale?.total ?? 0), 0);
  const debe = jobs.filter((j) => j.status === "POR_COBRAR").reduce((s, j) => s + j.price, 0);
  const enlace = (d: string) => "/panel/patio/historial" + (d === today ? "" : "?d=" + d);

  return (
    <>
      <PageHeader title="Historial del patio" subtitle={q ? "Buscando «" + q + "»" : prettyDay(day)}>
        <Link href="/panel/patio" className="btn-ghost btn-sm">
          Volver al patio
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!q && (
          <>
            <Link href={enlace(addDays(day, -1))} className="btn-ghost btn-sm">
              Día anterior
            </Link>
            <Link href={enlace(today)} className="btn-ghost btn-sm">
              Hoy
            </Link>
            {day < today && (
              <Link href={enlace(addDays(day, 1))} className="btn-ghost btn-sm">
                Día siguiente
              </Link>
            )}
          </>
        )}
        <form action="/panel/patio/historial" className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-sm">
          <input
            className="input min-w-0 flex-1 py-1.5 text-sm"
            name="q"
            defaultValue={q}
            placeholder="Placa, cliente o celular"
            aria-label="Buscar vehículo"
          />
          <button type="submit" className="btn-ghost btn-sm">
            <Icon name="search" className="h-4 w-4" />
            Buscar
          </button>
          {q && (
            <Link href="/panel/patio/historial" className="btn-ghost btn-sm">
              Quitar
            </Link>
          )}
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Vehículos" value={String(activos.length)} tone="brand" />
        <Stat label="Cobrado" value={money(cobrado, user.currency)} />
        <Stat label="Pendiente de pago" value={money(debe, user.currency)} />
      </div>

      <Card className="mt-4" title="Vehículos">
        {jobs.length === 0 ? (
          <Empty
            title={q ? "No encontramos vehículos con eso" : "No entró ningún vehículo este día"}
            hint={q ? "Prueba con otra placa o con el nombre del cliente." : "Prueba con otro día o busca por placa."}
          />
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => {
              const carro = [j.vehiclePlate, j.vehicleType, j.vehicleColor].filter(Boolean).join(" · ");
              const precio = j.sale ? j.sale.total : j.price;
              const emitida = tieneFacturaEmitida(j.sale);
              return (
                <li key={j.id} data-vehiculo-historial={j.id} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-strong">{carro || j.clientName}</p>
                      <p className="text-xs text-muted">
                        {j.clientName} · {j.clientPhone}
                        {q ? " · " + shortDay(j.day) : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">
                        {j.serviceName} · {money(precio, user.currency)}
                        {j.receivedBy ? " · recibió " + j.receivedBy.name : ""}
                        {j.assignedStaff ? " · lavó " + j.assignedStaff.name : ""}
                      </p>
                      {j.sale && (
                        <p className="mt-0.5 text-xs text-subtle">
                          Cobrado en {PAGO[j.sale.paymentMethod] ?? j.sale.paymentMethod} el {shortDay(j.sale.day)}
                          {j.sale.receiptSeq ? " · recibo #" + formatReceiptSeq(j.sale.receiptSeq) : ""}
                        </p>
                      )}
                    </div>
                    <Badge tone={ESTADO_TONO[j.status] ?? "amber"}>{ESTADO_LABEL[j.status] ?? j.status}</Badge>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <details className="group w-full sm:w-auto">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-brand-600">
                        <Icon name="pencil" className="h-3.5 w-3.5" />
                        Editar datos
                      </summary>
                      <FormSinSenal accion="updateWashJobAction" servidor={updateWashJobAction} className="mt-2 space-y-2">
                        <input type="hidden" name="id" value={j.id} />
                        <div className="grid gap-2 sm:grid-cols-3">
                          <input className="input py-1.5 text-xs" name="clientName" defaultValue={j.clientName} aria-label="Cliente" required />
                          <input className="input py-1.5 text-xs" name="clientPhone" defaultValue={j.clientPhone} aria-label="Celular" inputMode="tel" />
                          <input className="input py-1.5 text-xs" name="vehiclePlate" defaultValue={j.vehiclePlate ?? ""} aria-label="Placa" placeholder="Placa" />
                          <select className="input py-1.5 text-xs" name="vehicleType" defaultValue={j.vehicleType ?? ""} aria-label="Tipo de vehículo">
                            <option value="">Sin tipo</option>
                            <option value="carro">Carro</option>
                            <option value="camioneta">Camioneta</option>
                            <option value="moto">Moto</option>
                          </select>
                          <input className="input py-1.5 text-xs" name="vehicleColor" defaultValue={j.vehicleColor ?? ""} aria-label="Color" placeholder="Color" />
                          {/* Ya cobrado, el servicio queda como se cobró: la venta lo dice. */}
                          <select
                            className="input py-1.5 text-xs"
                            name="serviceId"
                            defaultValue={j.serviceId ?? ""}
                            aria-label="Servicio"
                            disabled={Boolean(j.sale)}
                          >
                            <option value="">{j.serviceId ? "Sin cambiar" : j.serviceName}</option>
                            {services.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} · {money(s.price, user.currency)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input className="input w-full py-1.5 text-xs" name="notes" defaultValue={j.notes ?? ""} placeholder="Nota (opcional)" aria-label="Nota" />
                        <SubmitButton className="btn-ghost btn-sm" pendingText="Guardando...">
                          Guardar cambios
                        </SubmitButton>
                      </FormSinSenal>
                    </details>

                    {!emitida && (
                      <FormSinSenal accion="cambiarPrecioLavadoAction" servidor={cambiarPrecioLavadoAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="washJobId" value={j.id} />
                        <input
                          name="price"
                          type="text"
                          inputMode="numeric"
                          defaultValue={aCampo(precio, user.currency)}
                          aria-label="Precio del lavado"
                          className="input w-24 px-2 py-1 text-xs"
                          required
                        />
                        <SubmitButton className="btn-ghost btn-sm px-2 text-xs" pendingText="...">
                          Cambiar precio
                        </SubmitButton>
                      </FormSinSenal>
                    )}

                    <div className="ml-auto">
                      {emitida ? (
                        <p className="text-[11px] text-muted">Tiene factura autorizada: se anula con nota crédito, no se borra.</p>
                      ) : (
                        <FormSinSenal accion="deleteWashJobAction" servidor={deleteWashJobAction}>
                          <input type="hidden" name="id" value={j.id} />
                          <BotonBorrar
                            ariaLabel="Borrar vehículo"
                            className="btn-ghost btn-sm text-bad"
                            aviso={avisoBorrarVehiculo(
                              {
                                day: j.day,
                                clientName: j.clientName,
                                vehiclePlate: j.vehiclePlate,
                                vehicleType: j.vehicleType,
                                vehicleColor: j.vehicleColor,
                                serviceName: j.serviceName,
                                price: j.price,
                                status: j.status,
                                lavador: j.assignedStaff,
                                appointment: Boolean(j.appointmentId),
                                sale: j.sale
                                  ? {
                                      total: j.sale.total,
                                      paymentMethod: j.sale.paymentMethod,
                                      day: j.sale.day,
                                      receiptSeq: j.sale.receiptSeq,
                                      conSello: conSello.has(j.sale.id),
                                    }
                                  : null,
                              },
                              { currency: user.currency, cajaCerrada: Boolean(j.sale && diasCerrados.has(j.sale.day)) }
                            )}
                          >
                            <Icon name="trash" className="h-4 w-4" />
                            Borrar
                          </BotonBorrar>
                        </FormSinSenal>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
