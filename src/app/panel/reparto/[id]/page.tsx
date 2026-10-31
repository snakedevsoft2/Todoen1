import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { prettyDay } from "@/lib/format";
import { todayIn } from "@/lib/dates";
import { sesionDeReparto } from "@/lib/reparto-acceso";
import { cargarPlanilla, carteraDe, precioDelDia } from "@/lib/reparto-datos";
import { PlanillaReparto, type Pendiente } from "@/components/reparto/PlanillaReparto";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, string> = { BORRADOR: "Abierta", CERRADA: "Cerrada", ANULADA: "Anulada" };

/** La planilla de un vendedor en un dia. */
export default async function PlanillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await sesionDeReparto();
  const { id } = await params;
  const planilla = await cargarPlanilla(user.id, id);
  if (!planilla) notFound();
  const hoy = todayIn(user.timezone);

  const [productos, clientes, cartera, equipo] = await Promise.all([
    db.repartoProducto.findMany({
      where: { userId: user.id, OR: [{ active: true }, { id: { in: planilla.lineas.map((l) => l.productoId) } }] },
      orderBy: [{ position: "asc" }, { code: "asc" }],
      include: { precios: { select: { price: true, desde: true } } },
    }),
    db.repartoCliente.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { name: true } }),
    carteraDe(user.id, hoy),
    db.staff.findMany({ where: { userId: user.id }, select: { name: true } }),
  ]);

  // Lo que se le puede cobrar hoy: los documentos con saldo. Sin buscar se
  // ven los de los clientes de este vendedor.
  const pendientes: Pendiente[] = cartera.flatMap((c) =>
    c.documentos
      .filter((d) => d.saldo > 0)
      .map((d) => ({ creditoId: d.id, cliente: c.name, day: d.day, documento: d.documento, saldo: d.saldo, dias: d.dias, delVendedor: c.staffId === planilla.staffId }))
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={"/panel/reparto?mes=" + planilla.day.slice(0, 7)} className="btn-ghost btn-sm">← Planillas</Link>
        <h2 className="font-display text-[18px] text-strong" data-titulo-planilla>
          {planilla.staff.name} · {prettyDay(planilla.day)}
        </h2>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted" data-estado-planilla>
          {ESTADO[planilla.estado]}
        </span>
        {planilla.origen === "EXCEL" && <span className="text-[11px] text-subtle">Importada del Excel ({planilla.origenRef})</span>}
        {planilla.notes && <span className="basis-full text-[12px] text-subtle">{planilla.notes}</span>}
      </div>
      <PlanillaReparto
        planilla={{
          id: planilla.id,
          day: planilla.day,
          estado: planilla.estado,
          vendedor: planilla.staff.name,
          acompanante: planilla.acompanante,
          otrosDescuentos: planilla.otrosDescuentos,
          entregado: planilla.entregado,
          entregadoDetalle: planilla.entregadoDetalle,
          notes: planilla.notes,
          auditoria: planilla.auditoria,
          origen: planilla.origen,
          lineas: planilla.lineas,
          creditos: planilla.creditos.map((c) => ({
            id: c.id,
            cliente: c.cliente.name,
            day: c.day,
            documento: c.documento,
            factura: c.factura,
            valor: c.valor,
            conCobros: c.cobros.length > 0,
          })),
          cobros: planilla.cobros.map((c) => ({ ...c, cliente: c.cliente?.name ?? null })),
          pagos: planilla.pagos,
        }}
        productos={productos.map((p) => ({ id: p.id, code: p.code, name: p.name, precioDia: precioDelDia(p, planilla.day) }))}
        clientes={clientes.map((c) => c.name)}
        pendientes={pendientes}
        personas={equipo.map((s) => s.name)}
        currency={user.currency}
      />
    </>
  );
}
