import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inicioDelDiaEn, startOfMonth, todayIn } from "@/lib/dates";
import { money } from "@/lib/format";
import { diasSinContacto } from "@/lib/crm";
import { whereDeSegmento } from "@/lib/clientes";
import { iniciales, textoUltimoContacto } from "@/lib/crm-filas";
import { Card, Empty, Stat } from "@/components/ui";
import { ClienteForm, ImportarClientes } from "@/components/ClienteForm";
import { CargaMasiva } from "@/components/CargaMasiva";
import { Pastilla } from "@/components/EtiquetasCliente";
import { Icon } from "@/components/Icon";
import { esPlanCompleto } from "@/lib/plan";
import { SoloPlanPago } from "@/components/SoloPlanPago";
import { ListaClientes } from "@/components/ListaClientes";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; t?: string }>;
}) {
  const { user, staff } = await requireSession();
  const params = await searchParams;
  const q = String(params.q ?? "").slice(0, 100);
  const t = String(params.t ?? "").slice(0, 40);
  const hoy = todayIn(user.timezone);
  const esDueno = staff.role === "DUENO";

  const [clientes, total, nuevosMes, atrasados, abierto, etiquetas] = await Promise.all([
    db.customer.findMany({
      where: whereDeSegmento(user.id, { q, etiquetas: t ? [t] : [] }),
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
        _count: {
          select: { followUps: { where: { doneAt: null } }, deals: { where: { closedAt: null } } },
        },
      },
    }),
    db.customer.count({ where: { userId: user.id } }),
    db.customer.count({
      where: { userId: user.id, createdAt: { gte: inicioDelDiaEn(startOfMonth(hoy), user.timezone) } },
    }),
    db.followUp.count({ where: { userId: user.id, doneAt: null, dueDay: { lt: hoy } } }),
    db.deal.aggregate({ where: { userId: user.id, closedAt: null }, _sum: { value: true } }),
    db.customerTag.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  const filtrando = Boolean(q || t);
  // Para "elegir todos": cuantos coinciden con lo que se esta mirando, no solo los 200 que se ven.
  const totalFiltro = filtrando
    ? await db.customer.count({ where: whereDeSegmento(user.id, { q, etiquetas: t ? [t] : [] }) })
    : total;
  const ahora = new Date();
  const conFiltro = (cambio: { q?: string; t?: string }) => {
    const u = new URLSearchParams();
    const nq = cambio.q ?? q;
    const nt = cambio.t ?? t;
    if (nq) u.set("q", nq);
    if (nt) u.set("t", nt);
    const s = u.toString();
    return "/panel/clientes" + (s ? "?" + s : "");
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Clientes" value={String(total)} hint={nuevosMes + " nuevos este mes"} />
        <Stat
          label="En el embudo"
          value={money(abierto._sum.value ?? 0, user.currency)}
          hint="Ventas que siguen abiertas"
          tone="good"
        />
        <Stat
          label="Seguimientos atrasados"
          value={String(atrasados)}
          hint={atrasados > 0 ? "Revísalos hoy" : "Todo al día"}
          tone={atrasados > 0 ? "bad" : "default"}
        />
        <Stat label="Etiquetas" value={String(etiquetas.length)} hint="Para agrupar clientes" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <form action="/panel/clientes" className="flex gap-2">
            {t && <input type="hidden" name="t" value={t} />}
            <div className="relative min-w-0 flex-1">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
              />
              <input
                className="input pl-9"
                type="search"
                name="q"
                defaultValue={q}
                maxLength={100}
                placeholder="Buscar por nombre, teléfono, correo o cédula"
                aria-label="Buscar cliente"
              />
            </div>
            <button type="submit" className="btn-ghost">
              Buscar
            </button>
          </form>

          {etiquetas.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {etiquetas.map((e) => (
                <Link
                  key={e.id}
                  href={conFiltro({ t: t === e.id ? "" : e.id })}
                  aria-pressed={t === e.id}
                  className="transition-transform duration-150 active:scale-95"
                >
                  <Pastilla etiqueta={e} puesta={t === e.id} />
                </Link>
              ))}
            </div>
          )}

          <div className="mt-4">
            {clientes.length === 0 ? (
              filtrando ? (
                <Empty
                  title="Nadie coincide con esa búsqueda"
                  hint="Prueba con otra parte del nombre o quita la etiqueta."
                />
              ) : (
                <Empty
                  title="Todavía no tienes clientes"
                  hint="Agrégalos a la derecha, o trae los que ya están en turnos, ventas y cartera."
                />
              )
            ) : (
              <ListaClientes
                clientes={clientes.map((c) => ({
                  id: c.id,
                  name: c.name,
                  iniciales: iniciales(c.name),
                  detalle:
                    (c.phone ?? c.email ?? "Sin teléfono") + " · " + textoUltimoContacto(diasSinContacto(c.lastContactAt, ahora)),
                  etiquetas: c.tags.slice(0, 4).map((l) => l.tag),
                  pendientes: c._count.followUps,
                  abiertas: c._count.deals,
                }))}
                puedeBorrar={esDueno}
                totalFiltro={totalFiltro}
                filtro={{ q, t }}
              />
            )}
            {clientes.length === 200 && (
              <p className="mt-3 text-center text-xs text-subtle">
                Se muestran los 200 más recientes. Usa el buscador para encontrar a los demás.
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Agregar un cliente">
            <ClienteForm submitLabel="Agregar cliente" />
          </Card>
          <Card title="Subir muchos clientes de una vez" subtitle="Desde Excel o un archivo CSV">
            {!esDueno ? (
              <p className="text-[13px] text-muted">Solo el dueño del negocio sube listas de clientes.</p>
            ) : esPlanCompleto(user) ? (
              <CargaMasiva tipo="clientes" />
            ) : (
              <SoloPlanPago que="Carga masiva" negocio={user.businessName} />
            )}
          </Card>
          {esDueno && (
            <Card title="Trae los que ya tienes">
              <ImportarClientes />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
