import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIn } from "@/lib/dates";
import { estadoSeguimiento } from "@/lib/crm";
import {
  filaDeSeguimiento,
  INCLUIR_SEGUIMIENTO,
  opcionesDeClientes,
  personasDe,
} from "@/lib/crm-filas";
import { Card, Empty } from "@/components/ui";
import { SeguimientoFila, SeguimientoForm } from "@/components/Seguimientos";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function SeguimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const { user, staff } = await requireSession();
  const esDueno = staff.role === "DUENO";
  const hoy = todayIn(user.timezone);
  const params = await searchParams;

  // El dueño arranca viendo los de todos; cada quien, los suyos.
  const ver = params.ver === "mios" || params.ver === "todos" ? params.ver : esDueno ? "todos" : "mios";
  const deQuien = ver === "mios" ? { OR: [{ staffId: staff.id }, { staffId: null }] } : {};

  const [pendientes, hechos, personas, clientes] = await Promise.all([
    db.followUp.findMany({
      where: { userId: user.id, doneAt: null, ...deQuien },
      orderBy: [{ dueDay: "asc" }, { dueTime: { sort: "asc", nulls: "last" } }],
      take: 300,
      include: INCLUIR_SEGUIMIENTO,
    }),
    db.followUp.findMany({
      where: { userId: user.id, doneAt: { not: null }, ...deQuien },
      orderBy: { doneAt: "desc" },
      take: 15,
      include: INCLUIR_SEGUIMIENTO,
    }),
    personasDe(user.id),
    opcionesDeClientes(user.id),
  ]);

  const ctx = { hoy, yoId: staff.id, esDueno, numeroNegocio: user.whatsappNumber };
  const grupos = [
    { key: "atrasado", titulo: "Atrasados", tono: "text-bad", vacio: null },
    { key: "hoy", titulo: "Para hoy", tono: "text-warn", vacio: "Nada para hoy." },
    { key: "proximo", titulo: "Próximos", tono: "text-strong", vacio: null },
  ].map((g) => ({ ...g, filas: pendientes.filter((p) => estadoSeguimiento(p, hoy) === g.key) }));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="De quién">
            {[
              { key: "mios", label: "Míos" },
              { key: "todos", label: "De todos" },
            ].map((o) => (
              <Link
                key={o.key}
                href={"/panel/clientes/seguimientos?ver=" + o.key}
                role="tab"
                aria-selected={ver === o.key}
                className={
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-200 " +
                  (ver === o.key ? "bg-panel text-strong shadow-card" : "text-muted hover:text-strong")
                }
              >
                {o.label}
              </Link>
            ))}
          </div>
          <p className="ml-auto text-sm text-muted">
            {pendientes.length} {pendientes.length === 1 ? "pendiente" : "pendientes"}
          </p>
        </div>

        {pendientes.length === 0 ? (
          <Card>
            <Empty
              title="No tienes nada pendiente"
              hint="Agenda aquí lo que hay que hacer con cada cliente: llamarlo, mandarle la cotización, pasar a cobrar."
            />
          </Card>
        ) : (
          grupos
            .filter((g) => g.filas.length > 0 || g.vacio)
            .map((g) => (
              <Card key={g.key}>
                <h2 className={"flex items-center gap-2 text-sm font-bold " + g.tono}>
                  {g.key === "atrasado" && <Icon name="alert" className="h-4 w-4" />}
                  {g.titulo}
                  <span className="text-muted">({g.filas.length})</span>
                </h2>
                {g.filas.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{g.vacio}</p>
                ) : (
                  <ul className="mt-1">
                    {g.filas.map((s) => (
                      <SeguimientoFila key={s.id} s={filaDeSeguimiento(s, ctx)} />
                    ))}
                  </ul>
                )}
              </Card>
            ))
        )}

        {hechos.length > 0 && (
          <Card title="Hechos hace poco">
            <ul>
              {hechos.map((s) => (
                <SeguimientoFila key={s.id} s={filaDeSeguimiento(s, ctx)} />
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="min-w-0">
        <Card title="Agendar seguimiento">
          <SeguimientoForm hoy={hoy} yoId={staff.id} personas={personas} clientes={clientes} />
        </Card>
      </div>
    </div>
  );
}
