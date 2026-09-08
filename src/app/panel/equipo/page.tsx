import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { startOfMonth, todayIn } from "@/lib/dates";
import { money, shortDay } from "@/lib/format";
import { getStaffTotals } from "@/lib/queries";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { NewStaffForm, StaffCard, type StaffRow } from "@/components/StaffForms";

export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  const { user } = await requireOwner();
  if (user.businessType !== "BARBERIA") redirect("/panel");

  const today = todayIn(user.timezone);
  const from = startOfMonth(today);

  const [team, totals] = await Promise.all([
    db.staff.findMany({
      where: { userId: user.id },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    getStaffTotals(user.id, from, today),
  ]);

  const statsById = new Map(totals.rows.map((row) => [row.staffId, row]));
  const conUsuario = team.filter((s) => Boolean(s.email)).length;
  const activos = team.filter((s) => s.active).length;
  const mesVendido = totals.rows.reduce((sum, r) => sum + r.totalSales, 0);

  const rows: StaffRow[] = team.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    role: s.role,
    color: s.color,
    commissionPct: s.commissionPct,
    bookable: s.bookable,
    active: s.active,
    hasPassword: Boolean(s.passwordHash),
  }));

  return (
    <>
      <PageHeader
        title="Barberos"
        subtitle="Quien atiende en la barberia y quien puede entrar a la aplicacion"
      >
        <Link href="/panel/reportes" className="btn-ghost btn-sm">
          <Icon name="chart" className="h-4 w-4" />
          Ver medicion
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Barberos activos" value={String(activos)} hint={team.length + " en total"} tone="brand" />
        <Stat label="Con usuario propio" value={String(conUsuario)} hint="Pueden entrar solos" />
        <Stat
          label="Vendido este mes"
          value={money(mesVendido, user.currency)}
          hint={"Desde el " + shortDay(from)}
          tone="good"
        />
        <Stat
          label="Sin barbero asignado"
          value={money(totals.unassigned.totalSales, user.currency)}
          hint={totals.unassigned.salesCount + " ventas"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_400px]">
        <Card title="Tu equipo" subtitle="Toca Editar para cambiar sus datos o darle acceso">
          {rows.length === 0 ? (
            <Empty title="Todavia no tienes barberos" hint="Agrega el primero a la derecha." />
          ) : (
            <ul className="space-y-3">
              {rows.map((staff) => {
                const stat = statsById.get(staff.id);
                return (
                  <StaffCard
                    key={staff.id}
                    staff={staff}
                    currency={user.currency}
                    stats={
                      stat
                        ? {
                            totalSales: money(stat.totalSales, user.currency),
                            attended: stat.attended,
                            booked: stat.booked,
                            commission: money(stat.commission, user.currency),
                          }
                        : undefined
                    }
                  />
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Agregar un barbero" subtitle="Con su usuario para que maneje el sistema">
            <NewStaffForm />
          </Card>

          <Card title="Como funciona">
            <ul className="space-y-2 text-sm text-body">
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Cada barbero entra por la misma pagina de ingreso, con su correo y su contrasena.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Ve la agenda completa, las ventas, los gastos y los reportes de la barberia.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                No puede entrar a Personalizar, Avisos ni a esta pagina de Barberos.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Los clientes eligen con quien quieren el turno desde tu enlace de reservas.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Cada turno y cada venta queda a nombre de quien atendio, y eso se ve en Reportes.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
