import Link from "next/link";
import { db } from "@/lib/db";
import { addDays, startOfMonth, todayIn } from "@/lib/dates";
import { money, shortDay } from "@/lib/format";
import { calcularCuadre } from "@/lib/reparto";
import { sesionDeReparto } from "@/lib/reparto-acceso";
import { Card, Empty, Stat } from "@/components/ui";
import { AbrirPlanilla } from "@/components/reparto/RepartoForms";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, string> = { BORRADOR: "Abierta", CERRADA: "Cerrada", ANULADA: "Anulada" };
const COLOR: Record<string, string> = { cuadra: "text-good", faltante: "text-bad", sobrante: "text-brand-600" };

/** Las planillas de un mes, con su cuadre, y abrir la de hoy. */
export default async function RepartoPage({ searchParams }: { searchParams: Promise<{ mes?: string; v?: string }> }) {
  const { user } = await sesionDeReparto();
  const params = await searchParams;
  const hoy = todayIn(user.timezone);
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes! : hoy.slice(0, 7);
  const desde = mes + "-01";
  const hasta = addDays(startOfMonth(addDays(desde, 32)), -1);
  const anterior = startOfMonth(addDays(desde, -1)).slice(0, 7);
  const siguiente = addDays(hasta, 1).slice(0, 7);
  const cur = user.currency;

  const [equipo, planillas] = await Promise.all([
    db.staff.findMany({ where: { userId: user.id, active: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.repartoPlanilla.findMany({
      where: { userId: user.id, day: { gte: desde, lte: hasta }, ...(params.v ? { staffId: params.v } : {}) },
      orderBy: [{ day: "desc" }, { createdAt: "desc" }],
      include: {
        staff: { select: { name: true } },
        lineas: true,
        creditos: { select: { valor: true } },
        cobros: { select: { valor: true } },
        pagos: { select: { valor: true } },
      },
    }),
  ]);
  const filas = planillas.map((p) => ({ ...p, cuadre: calcularCuadre(p) }));
  const cuentan = filas.filter((p) => p.estado !== "ANULADA");
  const suma = (k: "ventasDiaria" | "credito" | "cartera" | "pagos" | "entregado" | "diferencia") => cuentan.reduce((s, p) => s + p.cuadre[k], 0);
  const enlace = (m: string, v = params.v) => "/panel/reparto?mes=" + m + (v ? "&v=" + v : "");

  return (
    <>
      <Card title="Abrir la planilla del día" subtitle="Si ya existe para ese vendedor y fecha, se abre la que hay.">
        <AbrirPlanilla equipo={equipo} hoy={hoy} />
      </Card>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link href={enlace(anterior)} className="btn-ghost btn-sm">← Mes anterior</Link>
        <span className="text-sm font-semibold text-strong" data-mes>{mes}</span>
        <Link href={enlace(siguiente)} className="btn-ghost btn-sm">Mes siguiente →</Link>
        <form action="/panel/reparto" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="mes" value={mes} />
          <select name="v" defaultValue={params.v ?? ""} className="input py-1.5 text-sm" aria-label="Vendedor">
            <option value="">Todos los vendedores</option>
            {equipo.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button type="submit" className="btn-ghost btn-sm">Ver</button>
        </form>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ventas del mes" value={money(suma("ventasDiaria"), cur)} hint={cuentan.length + " planillas"} tone="brand" />
        <Stat label="Crédito" value={money(suma("credito"), cur)} />
        <Stat label="Cartera cobrada" value={money(suma("cartera"), cur)} tone="good" />
        <Stat
          label="Sobrante / faltante"
          value={money(suma("diferencia"), cur)}
          hint="Positivo: faltó plata"
          tone={Math.abs(suma("diferencia")) <= 5 ? "good" : suma("diferencia") > 0 ? "bad" : "amber"}
        />
      </div>

      <Card className="mt-5" title="Planillas" subtitle="Toca una para verla o corregirla.">
        {filas.length === 0 ? (
          <Empty title="No hay planillas en este mes" hint="Abre la de hoy arriba, o importa el Excel en la pestaña Importar Excel." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]" data-lista-planillas>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-1.5">Fecha</th>
                  <th>Vendedor</th>
                  <th className="text-right">Ventas</th>
                  <th className="text-right">Crédito</th>
                  <th className="text-right">Cartera</th>
                  <th className="text-right">Pagos</th>
                  <th className="text-right">Entregado</th>
                  <th className="text-right">Dif.</th>
                  <th className="pl-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.id} className={"border-t border-line " + (p.estado === "ANULADA" ? "opacity-50" : "")}>
                    <td className="py-1.5">
                      <Link href={"/panel/reparto/" + p.id} className="link font-semibold">{shortDay(p.day)}</Link>
                    </td>
                    <td className="text-strong">{p.staff.name}</td>
                    <td className="text-right">{money(p.cuadre.ventasDiaria, cur)}</td>
                    <td className="text-right">{money(p.cuadre.credito, cur)}</td>
                    <td className="text-right">{money(p.cuadre.cartera, cur)}</td>
                    <td className="text-right">{money(p.cuadre.pagos, cur)}</td>
                    <td className="text-right">{money(p.cuadre.entregado, cur)}</td>
                    <td className={"text-right font-semibold " + COLOR[p.cuadre.semaforo]}>{money(p.cuadre.diferencia, cur)}</td>
                    <td className="pl-2 text-muted">{ESTADO[p.estado]}{p.origen === "EXCEL" ? " · Excel" : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line font-semibold text-strong">
                  <td className="py-1.5" colSpan={2}>Total (sin anuladas)</td>
                  <td className="text-right">{money(suma("ventasDiaria"), cur)}</td>
                  <td className="text-right">{money(suma("credito"), cur)}</td>
                  <td className="text-right">{money(suma("cartera"), cur)}</td>
                  <td className="text-right">{money(suma("pagos"), cur)}</td>
                  <td className="text-right">{money(suma("entregado"), cur)}</td>
                  <td className="text-right">{money(suma("diferencia"), cur)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
