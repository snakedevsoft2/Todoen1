import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isValidDay, todayIn } from "@/lib/dates";
import { money, prettyDay, shortDay } from "@/lib/format";
import { ITEM_NOUN, logoUrl, photoUrl } from "@/lib/nav";
import { variantLabel } from "@/lib/variants";
import { hasTeam } from "@/lib/staff";
import { getDaySummary } from "@/lib/queries";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { NewSaleForm, type VariantOption } from "@/components/NewSaleForm";
import { InvoiceActions } from "@/components/InvoiceActions";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { deleteSaleAction, updateSalePaymentAction } from "@/actions/sales";

export const dynamic = "force-dynamic";

const ORIGIN_LABEL: Record<string, string> = {
  MANUAL: "Directa",
  TURNO: "Turno",
  ORDEN: "Cuenta",
};

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

  const [sales, catalog, summary, team] = await Promise.all([
    db.sale.findMany({
      where: { userId: user.id, day },
      orderBy: { createdAt: "desc" },
      include: { items: true, staff: { select: { name: true, color: true } } },
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
    getDaySummary(user.id, day),
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

  // Cuanto hizo cada persona en el dia.
  const porPersona = team
    .map((person) => ({
      ...person,
      total: sales.filter((s) => s.staffId === person.id).reduce((sum, s) => sum + s.total, 0),
      count: sales.filter((s) => s.staffId === person.id).length,
    }))
    .filter((row) => row.count > 0);

  const logo = logoUrl(user.slug, user.logo, user.updatedAt);

  return (
    <>
      <PageHeader title="Ventas" subtitle={prettyDay(day)} />

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
        <Stat label="Ventas cerradas" value={String(summary.salesCount)} />
        <Stat
          label={isClothing ? "Prendas vendidas" : "Items vendidos"}
          value={String(summary.itemsSold)}
        />
        <Stat label="Ticket promedio" value={money(summary.ticketAverage, user.currency)} />
      </div>

      {porPersona.length > 1 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {porPersona.map((person) => (
            <div key={person.id} className="card-tight flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: person.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-strong">{person.name}</p>
                <p className="text-[11px] text-subtle">{person.count} ventas</p>
              </div>
              <p className="text-sm font-bold text-brand-600">
                {money(person.total, user.currency)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[420px_1fr]">
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
            currency={user.currency}
            today={day}
            itemLabel={ITEM_NOUN[user.businessType].plural}
            team={team}
            defaultStaffId={me.id}
            staffLabel={isClothing ? "Quien vendio" : "Quien atendio"}
          />
        </Card>

        <Card title="Ventas del dia" subtitle={sales.length + " movimientos"}>
          {sales.length === 0 ? (
            <Empty title="No hay ventas en este dia" hint="Registra la primera venta a la izquierda." />
          ) : (
            <ul className="space-y-2">
              {sales.map((s) => (
                <li key={s.id} className="rounded-xl border-2 border-edge bg-surface p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-strong">
                        {money(s.total, user.currency)}
                        <span className="ml-2 rounded-full border-2 border-edge px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
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
                      <form action={updateSalePaymentAction} className="flex items-center gap-1">
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
                      </form>
                      <form action={deleteSaleAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <SubmitButton
                          className="btn-ghost btn-sm px-2 text-bad"
                          pendingText="..."
                          ariaLabel="Borrar venta"
                          confirm={
                            "Borrar esta venta del dia" +
                            (s.items.some((i) => i.variantId)
                              ? ". Las prendas vuelven al inventario."
                              : "")
                          }
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </SubmitButton>
                      </form>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <InvoiceActions
                      data={{
                        saleId: s.id,
                        businessName: user.businessName,
                        businessPhone: user.phone,
                        businessAddress: user.address,
                        logoUrl: logo,
                        currency: user.currency,
                        day: s.day,
                        clientName: s.clientName,
                        paymentMethod: s.paymentMethod,
                        staffName: s.staff?.name ?? null,
                        items: s.items.map((i) => ({
                          name:
                            i.variantLabel && !i.name.includes(i.variantLabel)
                              ? i.name + " (" + i.variantLabel + ")"
                              : i.name,
                          qty: i.qty,
                          unitPrice: i.unitPrice,
                        })),
                        total: s.total,
                        notes: s.notes,
                      }}
                    />
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
