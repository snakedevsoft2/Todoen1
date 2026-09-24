import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isValidDay, todayIn } from "@/lib/dates";
import { money, prettyDay, shortDay } from "@/lib/format";
import { ITEM_NOUN, logoUrl, photoUrl } from "@/lib/nav";
import { variantLabel } from "@/lib/variants";
import { hasTeam } from "@/lib/staff";
import { esDueno } from "@/lib/permisos-empleado";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { NewSaleForm, type VariantOption } from "@/components/NewSaleForm";
import { InvoiceActions } from "@/components/InvoiceActions";
import { ImprimirVenta } from "@/components/ImprimirVenta";
import { FacturaAutorizada, type EmisorFactura } from "@/components/FacturaAutorizada";
import { configuracionFacturacion, facturaVista } from "@/lib/facturacion";
import { TARIFAS, datosPais } from "@/lib/facturacion/paises";
import type { InvoiceData } from "@/lib/invoice";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { deleteSaleAction, updateSalePaymentAction } from "@/actions/sales";
import { FormSinSenal } from "@/components/SinSenal";
import { esPlanCompleto } from "@/lib/plan";
import { ordenDeCategorias } from "@/lib/categorias-negocio";
import { categoriasVisiblesParaNegocio, ordenParaNegocio, soloTotalVendido } from "@/lib/orden-productos";

export const dynamic = "force-dynamic";

const ORIGIN_LABEL: Record<string, string> = {
  MANUAL: "Directa",
  TURNO: "Turno",
  ORDEN: "Cuenta",
};

/** Cuanto se vendio de cada producto en un grupo de ventas, de mas a menos. */
function agruparPorProducto(
  sales: { items: { name: string; qty: number; unitPrice: number }[] }[]
): { name: string; qty: number; total: number }[] {
  const porNombre = new Map<string, { name: string; qty: number; total: number }>();
  for (const sale of sales) {
    for (const item of sale.items) {
      const fila = porNombre.get(item.name) ?? { name: item.name, qty: 0, total: 0 };
      fila.qty += item.qty;
      fila.total += item.qty * item.unitPrice;
      porNombre.set(item.name, fila);
    }
  }
  return [...porNombre.values()].sort((a, b) => b.qty - a.qty);
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { user, staff: me } = await requireSession();
  const params = await searchParams;
  const today = todayIn(user.timezone);
  const day = params.d && isValidDay(params.d) ? params.d : today;
  const isClothing = user.businessType === "ROPA";
  const esLavadero = user.businessType === "LAVADERO";
  // Con empleados de cuenta separada, cada uno ve solo las ventas que hizo;
  // el dueño las ve todas (ver lib/permisos-empleado.ts).
  const propias = esDueno(me.role);
  const soloMias = propias ? {} : { staffId: me.id };

  const [sales, fiados, catalog, team] = await Promise.all([
    db.sale.findMany({
      where: { userId: user.id, day, ...soloMias },
      orderBy: { createdAt: "desc" },
      include: { items: true, staff: { select: { name: true, color: true } }, electronicInvoice: true },
    }),
    // Los fiados hechos desde esta pantalla (llevan llave): no son plata que
    // entro, asi que salen en la lista pero no suman en el resumen de arriba.
    db.debt.findMany({
      where: { userId: user.id, day, clientKey: { not: null }, ...soloMias },
      orderBy: { createdAt: "desc" },
      include: { staff: { select: { name: true, color: true } } },
    }),
    db.service.findMany({
      where: { userId: user.id, active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        price: true,
        category: true,
        image: true,
        updatedAt: true,
        trackStock: true,
        variants: {
          where: { active: true },
          orderBy: [{ size: "asc" }, { color: "asc" }],
          select: { id: true, size: true, color: true, stock: true, price: true },
        },
      },
    }),
    // La barberia reparte las ventas entre barberos; la tienda, entre empleados.
    hasTeam(user.businessType)
      ? db.staff.findMany({
          where: { userId: user.id, active: true },
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, color: true },
        })
      : Promise.resolve([]),
  ]);

  const services = catalog.map((s) => ({
    id: s.id,
    name: s.name,
    price: s.price,
    category: s.category,
    photo: photoUrl(s.id, s.image, s.updatedAt),
    variants: s.trackStock
      ? (s.variants.map((v) => ({
          id: v.id,
          label: variantLabel(v),
          stock: v.stock,
          price: v.price ?? s.price,
        })) satisfies VariantOption[])
      : undefined,
  }));

  // De las mismas ventas que se muestran: si es un empleado, ya vienen
  // filtradas a las suyas, y el resumen de arriba cuenta solo eso.
  const totalSales = sales.reduce((s, x) => s + x.total, 0);
  const itemsSold = sales.reduce((s, x) => s + x.items.reduce((n, i) => n + i.qty, 0), 0);
  const summary = {
    totalSales,
    salesCount: sales.length,
    itemsSold,
    ticketAverage: sales.length ? Math.round(totalSales / sales.length) : 0,
  };

  // Cuanto hizo cada persona en el dia. Solo tiene sentido para el dueño: un
  // empleado ya ve solo sus ventas, asi que aqui saldria nada mas su fila.
  const porPersona = propias
    ? team
        .map((person) => {
          const ventasDePersona = sales.filter((s) => s.staffId === person.id);
          return {
            ...person,
            total: ventasDePersona.reduce((sum, s) => sum + s.total, 0),
            count: ventasDePersona.length,
            // Cuanto vendio de cada producto, para saber en que se movio el dia.
            productos: agruparPorProducto(ventasDePersona),
          };
        })
        .filter((row) => row.count > 0)
    : [];

  // Cuanto se vendio de cada producto en total, para saber que se vende mas.
  const porProducto = agruparPorProducto(sales);
  const masVendido = porProducto[0] ?? null;

  const logo = logoUrl(user.slug, user.logo, user.updatedAt);

  // La factura autorizada (DIAN o SRI), si el negocio la tiene activa.
  const facturacion = await configuracionFacturacion(user.id);
  // La version gratis no tiene factura autorizada y sus facturas llevan la marca.
  const completo = esPlanCompleto(user);
  const etiquetaImpuesto =
    TARIFAS[facturacion.country].find((t) => t.value === facturacion.taxKey)?.label ?? "Impuesto";
  // Para el encabezado de la factura: RUC/NIT, razon social y, en Ecuador, la
  // sucursal (el establecimiento del SRI; en Colombia ese concepto no aplica).
  const emisorFactura: EmisorFactura = {
    ruc: facturacion.taxId || null,
    razonSocial: facturacion.legalName || null,
    establecimiento: facturacion.country === "EC" ? facturacion.establishment || null : null,
  };

  // Los clientes guardados, para escogerlos al vender.
  const clientesGuardados = await db.customer.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: { id: true, name: true, phone: true },
  });

  const datosFiado = (f: (typeof fiados)[number]): InvoiceData => ({
    saleId: f.id,
    businessName: user.businessName,
    businessPhone: user.phone,
    businessAddress: user.address,
    logoUrl: logo,
    currency: user.currency,
    day: f.day,
    clientName: f.clientName,
    clientPhone: f.clientPhone,
    businessEmail: user.email,
    paymentMethod: "CREDITO",
    staffName: f.staff?.name ?? null,
    items: [{ name: f.concept, qty: 1, unitPrice: f.amount }],
    total: f.amount,
    notes: f.notes,
    marcaGratis: !completo,
  });

  const datosFactura = (s: (typeof sales)[number]): InvoiceData => ({
    saleId: s.id,
    businessName: user.businessName,
    businessPhone: user.phone,
    businessAddress: user.address,
    logoUrl: logo,
    currency: user.currency,
    day: s.day,
    clientName: s.clientName,
    // El telefono del cliente no queda guardado en la venta: solo se conoce
    // justo al terminar (ver NewSaleForm), asi que en el historial no sale.
    clientPhone: null,
    businessEmail: user.email,
    paymentMethod: s.paymentMethod,
    staffName: s.staff?.name ?? null,
    items: s.items.map((i) => ({
      name: i.variantLabel && !i.name.includes(i.variantLabel) ? i.name + " (" + i.variantLabel + ")" : i.name,
      qty: i.qty,
      unitPrice: i.unitPrice,
    })),
    total: s.total,
    notes: s.notes,
    marcaGratis: !completo,
  });

  return (
    <>
      <PageHeader title="Ventas" subtitle={prettyDay(day) + (propias ? "" : " · Solo se ven tus ventas")} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={"/panel/ventas?d=" + addDays(day, -1)} className="btn-ghost btn-sm">
          Dia anterior
        </Link>
        <Link href="/panel/ventas" className="btn-ghost btn-sm">
          Hoy
        </Link>
        <Link href={"/panel/ventas?d=" + addDays(day, 1)} className="btn-ghost btn-sm">
          Dia siguiente
        </Link>
        <form className="ml-auto flex items-center gap-2" action="/panel/ventas">
          <input className="input max-w-[170px] py-1.5 text-sm" type="date" name="d" defaultValue={day} />
          <button className="btn-ghost btn-sm" type="submit">
            Ir
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total vendido" value={money(summary.totalSales, user.currency)} tone="brand" />
        {masVendido && (
          <Stat label="Más vendido" value={masVendido.name} hint={masVendido.qty + " vendidos"} />
        )}
        {!soloTotalVendido(user.businessName) && (
          <>
            <Stat label="Ventas cerradas" value={String(summary.salesCount)} />
            <Stat
              label={isClothing ? "Prendas vendidas" : "Items vendidos"}
              value={String(summary.itemsSold)}
            />
            <Stat label="Ticket promedio" value={money(summary.ticketAverage, user.currency)} />
          </>
        )}
      </div>

      {porPersona.length > 1 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {porPersona.map((person) => {
            const contenido = (
              <>
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: person.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-strong">{person.name}</p>
                    <p className="text-[11px] text-subtle">
                      {person.count} {esLavadero ? "carros lavados" : "ventas"}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-brand-600">
                    {money(person.total, user.currency)}
                  </p>
                </div>
                {person.productos.length > 0 && (
                  <ul className="mt-2 space-y-0.5 border-t border-line pt-2">
                    {person.productos.map((p) => (
                      <li
                        key={p.name}
                        className="flex items-center justify-between gap-2 text-[11px] text-subtle"
                      >
                        <span className="min-w-0 truncate">{p.name}</span>
                        <span className="shrink-0 font-medium text-body">{p.qty}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {esLavadero && (
                  <p className="mt-2 border-t border-line pt-2 text-[11px] font-semibold text-brand-600">
                    Ver los carros que lavó →
                  </p>
                )}
              </>
            );
            return esLavadero ? (
              <Link
                key={person.id}
                href={"/panel/patio/lavador/" + person.id + (day !== today ? "?d=" + day : "")}
                className="card-tight block transition hover:bg-surface"
              >
                {contenido}
              </Link>
            ) : (
              <div key={person.id} className="card-tight">
                {contenido}
              </div>
            );
          })}
        </div>
      )}

      {porProducto.length > 0 && (
        <Card
          title="Ventas por producto"
          subtitle="Cuánto se vendió de cada uno hoy"
          className="mt-5"
        >
          <ul className="space-y-1.5">
            {porProducto.map((p, i) => (
              <li
                key={p.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {i === 0 && (
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                      Más vendido
                    </span>
                  )}
                  <span className="truncate text-sm text-strong">{p.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className="text-subtle">{p.qty} vendidos</span>
                  <span className="font-semibold text-strong">{money(p.total, user.currency)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[420px_1fr] [&>*]:min-w-0">
        <Card
          title="Registrar una venta"
          subtitle={
            user.businessType === "BARBERIA"
              ? "Agrega los cortes que hiciste sin reserva"
              : isClothing
                ? "Elige la prenda, la talla y cobra"
                : "Venta directa sin abrir cuenta"
          }
        >
          {services.length === 0 && (
            <p className="mb-3 rounded-xl border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">
              Aun no tienes {ITEM_NOUN[user.businessType].plural}.{" "}
              <Link href="/panel/catalogo" className="link">
                Crealos aqui
              </Link>
              .
            </p>
          )}
          <NewSaleForm
            services={services}
            ordenCategorias={await ordenDeCategorias(user.id)}
            filasOrden={ordenParaNegocio(user.businessName)}
            categoriasVisibles={categoriasVisiblesParaNegocio(user.businessName)}
            sinValorManual={soloTotalVendido(user.businessName)}
            claveOrden={"orden-ventas:" + user.id}
            currency={user.currency}
            today={day}
            itemLabel={ITEM_NOUN[user.businessType].plural}
            team={team}
            defaultStaffId={me.id}
            staffLabel={isClothing ? "Quién vendió" : "Quién atendió"}
            timezone={user.timezone}
            cuenta={me.id}
            esHoy={day === today}
            clientes={clientesGuardados}
            marcaGratis={!completo}
            esDueno={propias}
            facturacion={
              completo && facturacion.enabled
                ? {
                    pais: facturacion.country,
                    entidad: datosPais(facturacion.country).entidad,
                    predeterminado: facturacion.defaultDocument,
                    etiquetaImpuesto,
                    emisor: emisorFactura,
                  }
                : null
            }
            negocio={{
              nombre: user.businessName,
              telefono: user.phone,
              direccion: user.address,
              correo: user.email,
              logoUrl: logo,
            }}
          />
        </Card>

        <Card title="Ventas del día" subtitle={sales.length + fiados.length + " movimientos"}>
          {sales.length + fiados.length === 0 ? (
            <Empty title="No hay ventas en este día" hint="Registra la primera venta a la izquierda." />
          ) : (
            <ul className="space-y-2">
              {sales.map((s) => (
                <li key={s.id} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-strong">
                        {money(s.total, user.currency)}
                        <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                          {ORIGIN_LABEL[s.origin]}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-body">
                        {s.items
                          .map(
                            (i) =>
                              i.qty +
                              "x " +
                              i.name +
                              (i.variantLabel && !i.name.includes(i.variantLabel)
                                ? " (" + i.variantLabel + ")"
                                : "")
                          )
                          .join(", ") || "Venta"}
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">
                        {s.clientName ?? "Mostrador"} - {shortDay(s.day)}
                        {s.notes ? " - " + s.notes : ""}
                      </p>
                      {s.staff && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: s.staff.color }}
                          />
                          {isClothing ? "Vendio " : "Atendio "}
                          {s.staff.name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <FormSinSenal accion="updateSalePaymentAction" servidor={updateSalePaymentAction} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={s.id} />
                        <select
                          name="paymentMethod"
                          defaultValue={s.paymentMethod}
                          className="input w-36 py-1.5 text-xs"
                        >
                          <option value="EFECTIVO">Efectivo</option>
                          <option value="TARJETA">Tarjeta</option>
                          <option value="TRANSFERENCIA">Transferencia</option>
                          <option value="OTRO">Otro</option>
                        </select>
                        <SubmitButton className="btn-ghost btn-sm px-2" pendingText="...">
                          <Icon name="check" className="h-4 w-4" />
                        </SubmitButton>
                      </FormSinSenal>
                      {!(s.electronicInvoice && ["AUTORIZADA", "ENVIANDO"].includes(s.electronicInvoice.status)) && (
                      <FormSinSenal accion="deleteSaleAction" servidor={deleteSaleAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <SubmitButton
                          className="btn-ghost btn-sm px-2 text-bad"
                          pendingText="..."
                          ariaLabel="Borrar venta"
                          confirm={
                            "Borrar esta venta del día" +
                            (s.items.some((i) => i.variantId)
                              ? ". Las prendas vuelven al inventario."
                              : "")
                          }
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </SubmitButton>
                      </FormSinSenal>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <InvoiceActions data={datosFactura(s)} soloBluetooth={!propias} />
                    <ImprimirVenta data={datosFactura(s)} soloBluetooth={!propias} />
                    <FacturaAutorizada
                      saleId={s.id}
                      pais={facturacion.country}
                      habilitada={completo && facturacion.enabled}
                      inicial={s.electronicInvoice ? facturaVista(s.electronicInvoice) : null}
                      base={datosFactura(s)}
                      etiquetaImpuesto={etiquetaImpuesto}
                      emisor={emisorFactura}
                      soloBluetooth={!propias}
                    />
                  </div>
                </li>
              ))}
              {fiados.map((f) => (
                <li key={f.id} className="rounded-xl border border-line bg-surface p-3">
                  <p className="text-sm font-semibold text-strong">
                    {money(f.amount, user.currency)}
                    <span className="ml-2 rounded-full border border-warn-line bg-warn-soft px-2 py-0.5 text-[10px] uppercase tracking-wide text-warn">
                      Fiado
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-body">{f.concept}</p>
                  <p className="mt-0.5 text-xs text-subtle">
                    {f.clientName} - {shortDay(f.day)}
                  </p>
                  {f.staff && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.staff.color }} />
                      {isClothing ? "Vendio " : "Atendio "}
                      {f.staff.name}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ImprimirVenta data={datosFiado(f)} soloBluetooth={!propias} />
                    <Link href={"/panel/cartera"} className="btn-ghost btn-sm">
                      Ver en Cuentas por cobrar
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
