import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isValidDay, todayIn } from "@/lib/dates";
import { aCampo, money, prettyDay, shortDay } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { StaffDot } from "@/components/StaffForms";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { cambiarPrecioLavadoAction } from "@/actions/lavadero";

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

/**
 * Lo que lavó un lavador en un día: cada carro, con su precio. Solo el dueño
 * lo ve (desde Ventas), igual que el resto de la medición por persona.
 */
export default async function LavadorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { user } = await requireOwner();
  if (user.businessType !== "LAVADERO") redirect("/panel");

  const { id } = await params;
  const persona = await db.staff.findFirst({ where: { id, userId: user.id } });
  if (!persona) notFound();

  const sp = await searchParams;
  const today = todayIn(user.timezone);
  const day = sp.d && isValidDay(sp.d) ? sp.d : today;

  const filas = await db.washJob.findMany({
    where: { userId: user.id, assignedStaffId: persona.id, day, status: { not: "CANCELADO" } },
    orderBy: { createdAt: "desc" },
    include: { sale: { select: { total: true } } },
  });
  // Lo cobrado manda sobre el precio del lavado: es lo que suman la caja y el
  // resumen del dia. Asi esta pantalla y el dashboard dan la misma cifra.
  const jobs = filas.map((j) => ({ ...j, price: j.sale ? j.sale.total : j.price }));

  const entregados = jobs.filter((j) => j.status === "ENTREGADO");
  const totalVendido = entregados.reduce((sum, j) => sum + j.price, 0);
  const ganancia = Math.round((totalVendido * persona.commissionPct) / 100);

  return (
    <>
      <PageHeader title={persona.name} subtitle={"Lavados de " + prettyDay(day)}>
        <Link href="/panel/ventas" className="btn-ghost btn-sm">
          Volver a ventas
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={"/panel/patio/lavador/" + persona.id + "?d=" + addDays(day, -1)} className="btn-ghost btn-sm">
          Día anterior
        </Link>
        <Link href={"/panel/patio/lavador/" + persona.id} className="btn-ghost btn-sm">
          Hoy
        </Link>
        <Link href={"/panel/patio/lavador/" + persona.id + "?d=" + addDays(day, 1)} className="btn-ghost btn-sm">
          Día siguiente
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Carros lavados" value={String(entregados.length)} tone="brand" />
        <Stat label="Vendido" value={money(totalVendido, user.currency)} />
        {persona.commissionPct > 0 && (
          <Stat label="Su comisión" value={money(ganancia, user.currency)} hint={persona.commissionPct + "%"} />
        )}
      </div>

      <Card className="mt-4" title="Carros lavados">
        {jobs.length === 0 ? (
          <Empty title="No lavó ningún carro este día" hint="Prueba con otro día." />
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <StaffDot name={persona.name} color={persona.color} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-strong">
                      {[j.vehiclePlate, j.vehicleType, j.vehicleColor].filter(Boolean).join(" · ") ||
                        j.clientName}
                    </p>
                    <p className="text-xs text-muted">
                      {j.serviceName} · {shortDay(j.day)}
                      {j.clientName ? " · " + j.clientName : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={ESTADO_TONO[j.status] ?? "amber"}>{ESTADO_LABEL[j.status] ?? j.status}</Badge>
                  {/* El dueño corrige el precio aqui mismo; si ya se cobro, cambia tambien la venta. */}
                  <details className="group relative">
                    <summary
                      className="flex cursor-pointer list-none items-center gap-1 text-sm font-bold text-strong"
                      aria-label="Cambiar el precio"
                    >
                      {money(j.price, user.currency)}
                      <Icon name="pencil" className="h-3.5 w-3.5 text-subtle" />
                    </summary>
                    <form
                      action={cambiarPrecioLavadoAction}
                      className="absolute right-0 z-10 mt-2 flex w-56 items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-soft"
                    >
                      <input type="hidden" name="washJobId" value={j.id} />
                      <input
                        name="price"
                        type="text"
                        inputMode="numeric"
                        defaultValue={aCampo(j.price, user.currency)}
                        aria-label="Precio nuevo"
                        className="input min-w-0 flex-1 px-2 py-1 text-sm"
                        required
                      />
                      <SubmitButton className="btn-primary btn-sm" pendingText="...">
                        Guardar
                      </SubmitButton>
                    </form>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
