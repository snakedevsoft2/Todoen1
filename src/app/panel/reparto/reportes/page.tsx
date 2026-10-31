import { db } from "@/lib/db";
import { startOfMonth, todayIn, isValidDay } from "@/lib/dates";
import { money, shortDay } from "@/lib/format";
import { CATEGORIAS_PAGO, semaforoDe } from "@/lib/reparto";
import { sesionDeReparto } from "@/lib/reparto-acceso";
import { consolidadoDe, type Consolidado } from "@/lib/reparto-datos";
import { Card, Empty } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ImprimirPagina } from "@/components/reparto/Imprimir";

export const dynamic = "force-dynamic";

const COLUMNAS_CUADRE: [keyof Consolidado["cuadre"], string][] = [
  ["ventasDiaria", "Ventas"],
  ["credito", "Crédito"],
  ["contado", "Contado"],
  ["cartera", "Cartera"],
  ["recibido", "Recibido"],
  ["pagos", "Pagos"],
  ["caja", "Caja"],
  ["entregado", "Entregado"],
  ["faltante", "Faltante"],
  ["sobrante", "Sobrante"],
  ["diferencia", "Neto"],
];

/**
 * Los reportes que antes salian de la hoja CONSOLID,MES, calculados: no se
 * guardan, salen de las planillas del rango (sin las anuladas).
 */
export default async function ReportesRepartoPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; v?: string }>;
}) {
  const { user } = await sesionDeReparto();
  const params = await searchParams;
  const hoy = todayIn(user.timezone);
  const desde = isValidDay(params.desde ?? "") ? params.desde! : startOfMonth(hoy);
  const hasta = isValidDay(params.hasta ?? "") ? params.hasta! : hoy;
  const cur = user.currency;

  const [equipo, datos] = await Promise.all([
    db.staff.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    consolidadoDe(user.id, desde, hasta, params.v || undefined),
  ]);
  const filas = [...datos.porVendedor, ...(datos.porVendedor.length > 1 ? [datos.general] : [])];

  // Gastos por categoria, en todas las planillas del rango.
  const gastos = new Map<string, { total: number; conceptos: Map<string, number> }>();
  for (const p of datos.planillas) {
    for (const g of p.pagos) {
      const c = gastos.get(g.categoria) ?? { total: 0, conceptos: new Map() };
      c.total += g.valor;
      c.conceptos.set(g.concepto, (c.conceptos.get(g.concepto) ?? 0) + g.valor);
      gastos.set(g.categoria, c);
    }
  }
  const descuadres = datos.planillas.filter((p) => semaforoDe(p.cuadre.diferencia) !== "cuadra");
  const query = "desde=" + desde + "&hasta=" + hasta + (params.v ? "&v=" + params.v : "");

  return (
    <>
      <form action="/panel/reparto/reportes" className="card-tight mb-4 flex flex-wrap items-end gap-2 print:hidden" data-filtro-reportes>
        <label className="text-xs text-muted">
          Desde
          <input className="input mt-1 py-1.5 text-sm" type="date" name="desde" defaultValue={desde} />
        </label>
        <label className="text-xs text-muted">
          Hasta
          <input className="input mt-1 py-1.5 text-sm" type="date" name="hasta" defaultValue={hasta} />
        </label>
        <label className="text-xs text-muted">
          Vendedor
          <select name="v" defaultValue={params.v ?? ""} className="input mt-1 py-1.5 text-sm">
            <option value="">Todos</option>
            {equipo.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary btn-sm">Ver</button>
        <span className="ml-auto flex flex-wrap gap-2">
          <a href={"/panel/reparto/exportar?tipo=consolidado&" + query} className="btn-ghost btn-sm" data-exportar-consolidado>
            <Icon name="download" className="h-4 w-4" />
            Consolidado en Excel
          </a>
          <a href={"/panel/reparto/exportar?tipo=planillas&" + query} className="btn-ghost btn-sm">
            <Icon name="download" className="h-4 w-4" />
            Planillas en Excel
          </a>
          <ImprimirPagina />
        </span>
      </form>

      {datos.planillas.length === 0 ? (
        <Card>
          <Empty title="No hay planillas en ese rango" />
        </Card>
      ) : (
        <div className="space-y-5">
          <Card title="Cuadre por vendedor" subtitle={shortDay(desde) + " al " + shortDay(hasta) + " · " + datos.planillas.length + " planillas"}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[12px]" data-consolidado>
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                    <th className="py-1.5">Vendedor</th>
                    <th className="text-right">Días</th>
                    {COLUMNAS_CUADRE.map(([, l]) => (
                      <th key={l} className="text-right">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.vendedor?.id ?? "general"} className={"border-t border-line " + (f.vendedor ? "" : "font-bold text-strong")}>
                      <td className="py-1.5">{f.vendedor?.name ?? "Consolidado general"}</td>
                      <td className="text-right">{f.dias}</td>
                      {COLUMNAS_CUADRE.map(([k]) => (
                        <td key={k} className={"text-right " + (k === "diferencia" ? (f.cuadre[k] > 5 ? "text-bad" : f.cuadre[k] < -5 ? "text-brand-600" : "text-good") : "")}>
                          {money(f.cuadre[k], cur)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-subtle">Neto positivo: el vendedor entregó menos de lo que debía (faltante). Negativo: entregó de más.</p>
          </Card>

          <Card title={"Ventas por producto" + (params.v ? "" : " (todos los vendedores)")}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[12px]" data-por-producto>
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                    <th className="py-1.5">Cód.</th>
                    <th>Producto</th>
                    <th className="text-right">Carga</th>
                    <th className="text-right">Devol</th>
                    <th className="text-right">Vendida</th>
                    <th className="text-right">Base 0</th>
                    <th className="text-right">Caducado</th>
                    <th className="text-right">Descuentos</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.general.productos.map((p) => (
                    <tr key={p.productoId} className="border-t border-line">
                      <td className="py-1 text-subtle">{p.code}</td>
                      <td className="text-strong">{p.name}</td>
                      <td className="text-right">{p.carga}</td>
                      <td className="text-right">{p.devolucion}</td>
                      <td className="text-right font-semibold">{p.vendida}</td>
                      <td className="text-right">{money(p.base0, cur)}</td>
                      <td className="text-right">{p.caducadoCant ? p.caducadoCant + " · " + money(p.caducadoValor, cur) : ""}</td>
                      <td className="text-right">{p.descuentos ? money(p.descuentos, cur) : ""}</td>
                      <td className="text-right font-semibold">{money(p.total, cur)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-bold text-strong">
                    <td colSpan={8} className="py-1.5">Total general por ventas</td>
                    <td className="text-right">{money(datos.general.cuadre.totalGeneral, cur)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Faltantes y sobrantes" subtitle="Los días que no cuadraron (más de 5 centavos)">
              {descuadres.length === 0 ? (
                <Empty title="Todos los días cuadraron" />
              ) : (
                <ul className="divide-y divide-line text-[13px]" data-descuadres>
                  {descuadres.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                      <a href={"/panel/reparto/" + p.id} className="link">{shortDay(p.day)} · {p.staff.name}</a>
                      <span className={"font-semibold " + (p.cuadre.diferencia > 0 ? "text-bad" : "text-brand-600")}>
                        {p.cuadre.diferencia > 0 ? "Faltó " : "Sobró "}
                        {money(Math.abs(p.cuadre.diferencia), cur)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Gastos por categoría">
              {gastos.size === 0 ? (
                <Empty title="No hubo gastos" />
              ) : (
                <ul className="space-y-2 text-[13px]" data-gastos>
                  {CATEGORIAS_PAGO.filter((c) => gastos.has(c.key)).map((c) => {
                    const g = gastos.get(c.key)!;
                    return (
                      <li key={c.key} className="rounded-xl border border-line bg-surface p-2.5">
                        <p className="flex justify-between font-semibold text-strong">
                          <span>{c.label}</span>
                          <span>{money(g.total, cur)}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-subtle">
                          {[...g.conceptos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => k + " " + money(v, cur)).join(" · ")}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
