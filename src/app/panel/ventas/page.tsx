import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isValidDay, todayIn } from "@/lib/dates";
import { money, prettyDay, shortDay } from "@/lib/format";
import { ITEM_NOUN } from "@/lib/nav";
import { getDaySummary } from "@/lib/queries";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { NewSaleForm } from "@/components/NewSaleForm";
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
  const user = await requireUser();
  const params = await searchParams;
  const today = todayIn(user.timezone);
  const day = params.d && isValidDay(params.d) ? params.d : today;

  const [sales, services, summary] = await Promise.all([
    db.sale.findMany({
      where: { userId: user.id, day },
      orderBy: { createdAt: "desc" },
      include: { items: true },
    }),
    db.service.findMany({
      where: { userId: user.id, active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, price: true, category: true },
    }),
    getDaySummary(user.id, day),
  ]);

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
        <Stat label="Items vendidos" value={String(summary.itemsSold)} />
        <Stat label="Ticket promedio" value={money(summary.ticketAverage, user.currency)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card
          title="Registrar una venta"
          subtitle={
            user.businessType === "BARBERIA"
              ? "Agrega los cortes que hiciste sin reserva"
              : "Venta directa sin abrir cuenta"
          }
        >
          {services.length === 0 && (
            <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
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
          />
        </Card>

        <Card title="Ventas del dia" subtitle={sales.length + " movimientos"}>
          {sales.length === 0 ? (
            <Empty title="No hay ventas en este dia" hint="Registra la primera venta a la izquierda." />
          ) : (
            <ul className="space-y-2">
              {sales.map((s) => (
                <li key={s.id} className="rounded-xl border border-line bg-ink/50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {money(s.total, user.currency)}
                        <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                          {ORIGIN_LABEL[s.origin]}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        {s.items.map((i) => i.qty + "x " + i.name).join(", ") || "Venta"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {s.clientName ?? "Mostrador"} - {shortDay(s.day)}
                        {s.notes ? " - " + s.notes : ""}
                      </p>
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
                          className="btn-ghost btn-sm px-2 text-rose-300"
                          pendingText="..."
                          confirm="Borrar esta venta del dia"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </SubmitButton>
                      </form>
                    </div>
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
