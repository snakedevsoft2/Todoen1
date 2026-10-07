import Link from "next/link";
import { redirect } from "next/navigation";
import { tieneParqueadero } from "@/lib/parqueadero";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, inicioDelDiaEn, isValidDay, todayIn } from "@/lib/dates";
import { money, prettyDay } from "@/lib/format";
import { duracionTexto, minutosEntre, numeroTicket } from "@/lib/parqueadero-tarifa";
import { fechaHora } from "@/lib/ticket-parqueadero";
import { Badge, Card, Empty, PageHeader, PAYMENT_LABELS, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, { label: string; tone: "blue" | "green" | "amber" | "red" }> = {
  DENTRO: { label: "Adentro", tone: "blue" },
  PAGADO: { label: "Pagado", tone: "green" },
  POR_COBRAR: { label: "Debe", tone: "amber" },
  ANULADO: { label: "Anulado", tone: "red" },
};

/**
 * La contabilidad del parqueadero por dia: que entro, que salio, cuanto se
 * cobro y por que medio, y cuanto quedo debiendo. Lo cobrado es lo mismo que
 * aparece en Ventas y en la caja, porque sale de las mismas ventas.
 */
export default async function HistorialParqueaderoPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { user } = await requireSession();
  if (!tieneParqueadero(user.businessType)) redirect("/panel");

  const hoy = todayIn(user.timezone);
  const { dia: diaIn } = await searchParams;
  const dia = diaIn && isValidDay(diaIn) && diaIn <= hoy ? diaIn : hoy;
  const desde = inicioDelDiaEn(dia, user.timezone);
  const hasta = inicioDelDiaEn(addDays(dia, 1), user.timezone);

  const [tickets, ventas] = await Promise.all([
    db.parkingTicket.findMany({
      where: {
        userId: user.id,
        OR: [{ day: dia }, { exitedAt: { gte: desde, lt: hasta } }, { sale: { day: dia } }],
      },
      orderBy: { enteredAt: "asc" },
      take: 1000,
    }),
    db.sale.findMany({
      where: { userId: user.id, day: dia, origin: "PARQUEADERO" },
      select: { total: true, paymentMethod: true },
    }),
  ]);

  const entraron = tickets.filter((t) => t.day === dia && t.status !== "ANULADO").length;
  const salieron = tickets.filter(
    (t) => (t.status === "PAGADO" || t.status === "POR_COBRAR") && t.exitedAt && t.exitedAt >= desde && t.exitedAt < hasta
  );
  const quedaronDebiendo = salieron.filter((t) => t.status === "POR_COBRAR");
  const cobrado = ventas.reduce((s, v) => s + v.total, 0);
  const porMedio = new Map<string, number>();
  for (const v of ventas) porMedio.set(v.paymentMethod, (porMedio.get(v.paymentMethod) ?? 0) + v.total);

  return (
    <>
      <PageHeader title="Historial del parqueadero" subtitle={prettyDay(dia)}>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={"/panel/parqueadero/historial?dia=" + addDays(dia, -1)} className="btn-ghost btn-sm">
            ← Día anterior
          </Link>
          {dia < hoy && (
            <Link href={"/panel/parqueadero/historial?dia=" + addDays(dia, 1)} className="btn-ghost btn-sm">
              Día siguiente →
            </Link>
          )}
          <form className="flex gap-2">
            <input type="date" name="dia" defaultValue={dia} max={hoy} className="input py-1.5 text-sm" aria-label="Elegir día" />
            <button className="btn-ghost btn-sm" type="submit">
              Ver
            </button>
          </form>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Entraron" value={String(entraron)} />
        <Stat label="Salieron" value={String(salieron.length)} />
        <Stat label="Cobrado" value={money(cobrado, user.currency)} hint={ventas.length + " pagos"} tone="good" />
        <Stat
          label="Salieron debiendo"
          value={String(quedaronDebiendo.length)}
          hint={money(
            quedaronDebiendo.reduce((s, t) => s + (t.amount ?? 0), 0),
            user.currency
          )}
          tone={quedaronDebiendo.length > 0 ? "amber" : "default"}
        />
      </div>

      {porMedio.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {[...porMedio.entries()].map(([m, v]) => (
            <span key={m} className="rounded-lg border border-line bg-surface px-3 py-1.5">
              {PAYMENT_LABELS[m] ?? m}: <b className="text-strong">{money(v, user.currency)}</b>
            </span>
          ))}
        </div>
      )}

      <Card className="mt-5" title="Movimientos del día">
        {tickets.length === 0 ? (
          <Empty title="No hubo movimiento este día" />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Placa</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>Tiempo</th>
                  <th className="text-right">Valor</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={"/panel/parqueadero/" + t.id} className="link">
                        {numeroTicket(t.seq)}
                      </Link>
                    </td>
                    <td className="font-semibold">
                      {t.plate} <span className="text-xs font-normal text-subtle">{t.vehicleType}</span>
                    </td>
                    <td className="whitespace-nowrap">{fechaHora(t.enteredAt.toISOString(), user.timezone)}</td>
                    <td className="whitespace-nowrap">{t.exitedAt ? fechaHora(t.exitedAt.toISOString(), user.timezone) : "-"}</td>
                    <td className="whitespace-nowrap">
                      {t.exitedAt ? duracionTexto(minutosEntre(t.enteredAt, t.exitedAt)) : "-"}
                    </td>
                    <td className="text-right">{t.amount != null ? money(t.amount, user.currency) : "-"}</td>
                    <td>
                      <Badge tone={ESTADO[t.status].tone}>{ESTADO[t.status].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
