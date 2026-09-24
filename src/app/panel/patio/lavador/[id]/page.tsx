import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, isValidDay, todayIn } from "@/lib/dates";
import { money, prettyDay, shortDay } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { StaffDot } from "@/components/StaffForms";

export const dynamic = "force-dynamic";

const ESTADO_LABEL: Record<string, string> = {
  EN_COLA: "En cola",
  LAVANDO: "Lavando",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};
const ESTADO_TONO: Record<string, "amber" | "blue" | "green" | "red"> = {
  EN_COLA: "amber",
  LAVANDO: "blue",
  LISTO: "blue",
  ENTREGADO: "green",
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

  const jobs = await db.washJob.findMany({
    where: { userId: user.id, assignedStaffId: persona.id, day, status: { not: "CANCELADO" } },
    orderBy: { createdAt: "desc" },
  });

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
                  <span className="text-sm font-bold text-strong">{money(j.price, user.currency)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
