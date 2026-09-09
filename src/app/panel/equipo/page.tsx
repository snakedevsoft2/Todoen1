import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { startOfMonth, todayIn } from "@/lib/dates";
import { money, shortDay } from "@/lib/format";
import { getStaffTotals } from "@/lib/queries";
import { hasTeam, teamNoun } from "@/lib/staff";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { NewStaffForm, StaffCard, type StaffRow } from "@/components/StaffForms";

export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  const { user } = await requireOwner();
  // La barberia tiene barberos y la tienda de ropa tiene empleados. Los demas
  // negocios no manejan equipo dentro de la aplicacion.
  if (!hasTeam(user.businessType)) redirect("/panel");

  const noun = teamNoun(user.businessType);
  const agenda = user.businessType === "BARBERIA";

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
  const comisiones = totals.rows.reduce((sum, r) => sum + r.commission, 0);

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
        title={noun.title}
        subtitle={
          agenda
            ? "Quien atiende en la barberia y quien puede entrar a la aplicacion"
            : "Quien vende en la tienda y quien puede entrar a la aplicacion"
        }
      >
        <Link href="/panel/reportes" className="btn-ghost btn-sm">
          <Icon name="chart" className="h-4 w-4" />
          Ver medicion
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={noun.title + " activos"}
          value={String(activos)}
          hint={team.length + " en total"}
          tone="brand"
        />
        <Stat label="Con usuario propio" value={String(conUsuario)} hint="Pueden entrar solos" />
        <Stat
          label="Vendido este mes"
          value={money(mesVendido, user.currency)}
          hint={"Desde el " + shortDay(from)}
          tone="good"
        />
        {agenda ? (
          <Stat
            label="Sin barbero asignado"
            value={money(totals.unassigned.totalSales, user.currency)}
            hint={totals.unassigned.salesCount + " ventas"}
          />
        ) : (
          <Stat
            label="Comisiones del mes"
            value={money(comisiones, user.currency)}
            hint="Segun el porcentaje de cada uno"
          />
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_400px]">
        <Card title="Tu equipo" subtitle="Toca Editar para cambiar sus datos o darle acceso">
          {rows.length === 0 ? (
            <Empty
              title={"Todavia no tienes " + noun.plural}
              hint="Agrega el primero a la derecha."
            />
          ) : (
            <ul className="space-y-3">
              {rows.map((staff) => {
                const stat = statsById.get(staff.id);
                return (
                  <StaffCard
                    key={staff.id}
                    staff={staff}
                    currency={user.currency}
                    businessType={user.businessType}
                    stats={
                      stat
                        ? {
                            totalSales: money(stat.totalSales, user.currency),
                            attended: stat.attended,
                            booked: stat.booked,
                            salesCount: stat.salesCount,
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
          <Card
            title={"Agregar un " + noun.singular}
            subtitle="Con su usuario para que maneje el sistema"
          >
            <NewStaffForm businessType={user.businessType} />
          </Card>

          <Card title="Como funciona">
            <ul className="space-y-2 text-sm text-body">
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Cada {noun.singular} entra por la misma pagina de ingreso, con su correo y su
                contrasena.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                {agenda
                  ? "Ve la agenda completa, las ventas, los gastos y los reportes de la barberia."
                  : "Ve el inventario, registra ventas y consulta gastos y reportes de la tienda."}
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                No puede entrar a Personalizar, Avisos ni a esta pagina de {noun.title}.
              </li>
              {agenda ? (
                <li className="flex gap-2">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                  Los clientes eligen con quien quieren el turno desde tu enlace de reservas.
                </li>
              ) : (
                <li className="flex gap-2">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                  Cada venta descuenta el stock de la talla vendida, sin que nadie lo haga a mano.
                </li>
              )}
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Cada venta queda a nombre de quien la hizo, y eso se ve en Reportes con su comision.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
