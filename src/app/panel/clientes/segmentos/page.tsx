import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { toInternational } from "@/lib/whatsapp";
import { ETAPAS, esEtapa } from "@/lib/crm";
import { whereDeSegmento, type FiltroSegmento } from "@/lib/clientes";
import { borrarEtiquetaAction } from "@/actions/crm";
import { Card, Empty } from "@/components/ui";
import { Pastilla } from "@/components/EtiquetasCliente";
import { MensajeSegmento } from "@/components/MensajeSegmento";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { FormSinSenal } from "@/components/SinSenal";

export const dynamic = "force-dynamic";

const TOPE = 500;

const DIAS = [
  { value: "", label: "Cualquiera" },
  { value: "15", label: "15 días o más" },
  { value: "30", label: "Un mes o más" },
  { value: "60", label: "Dos meses o más" },
  { value: "90", label: "Tres meses o más" },
];

export default async function SegmentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; t?: string | string[]; etapa?: string; dias?: string; pend?: string }>;
}) {
  const { user, staff } = await requireSession();
  const esDueno = staff.role === "DUENO";
  const params = await searchParams;

  const etiquetasElegidas = (Array.isArray(params.t) ? params.t : params.t ? [params.t] : [])
    .map((t) => String(t).slice(0, 40))
    .slice(0, 10);
  const dias = Number(params.dias);
  const filtro: FiltroSegmento = {
    q: String(params.q ?? "").slice(0, 100),
    etiquetas: etiquetasElegidas,
    etapa: esEtapa(params.etapa) ? params.etapa : null,
    sinContactoDias: Number.isFinite(dias) && dias > 0 ? Math.min(dias, 3650) : null,
    conPendientes: params.pend === "1",
  };

  const where = whereDeSegmento(user.id, filtro);
  const [etiquetas, total, clientes] = await Promise.all([
    db.customerTag.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, _count: { select: { links: true } } },
    }),
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: { name: "asc" },
      take: TOPE,
      select: { id: true, name: true, phone: true },
    }),
  ]);

  const elegidas = new Set(etiquetasElegidas);
  const destinatarios = clientes.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone ? toInternational(c.phone, user.whatsappNumber) : null,
  }));
  const conTelefono = destinatarios.filter((d) => d.phone).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="min-w-0 space-y-4">
        <Card title="Quiénes" subtitle="Combina los filtros: tienen que cumplirlos todos">
          <form action="/panel/clientes/segmentos" className="space-y-4">
            <label className="block">
              <span className="label">Nombre o teléfono</span>
              <input className="input" type="search" name="q" defaultValue={filtro.q} maxLength={100} />
            </label>

            {etiquetas.length > 0 && (
              <fieldset>
                <legend className="label">Con las etiquetas</legend>
                <div className="flex flex-wrap gap-2">
                  {etiquetas.map((e) => (
                    <label key={e.id} className="cursor-pointer">
                      <input
                        type="checkbox"
                        name="t"
                        value={e.id}
                        defaultChecked={elegidas.has(e.id)}
                        className="peer sr-only"
                      />
                      <span className="inline-block rounded-full opacity-60 transition-all duration-150 peer-checked:opacity-100 peer-checked:ring-2 peer-checked:ring-offset-2 peer-checked:ring-offset-panel peer-focus-visible:ring-2">
                        <Pastilla etiqueta={e} />
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <label className="block">
              <span className="label">Con una venta en</span>
              <select className="input" name="etapa" defaultValue={filtro.etapa ?? ""}>
                <option value="">Cualquier etapa o ninguna</option>
                {ETAPAS.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label">Sin hablarles hace</span>
              <select className="input" name="dias" defaultValue={filtro.sinContactoDias ? String(filtro.sinContactoDias) : ""}>
                {DIAS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-body">
              <input type="checkbox" name="pend" value="1" defaultChecked={filtro.conPendientes} className="h-4 w-4" />
              Solo los que tienen seguimientos pendientes
            </label>

            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1">
                <Icon name="search" className="h-4 w-4" />
                Ver clientes
              </button>
              <a href="/panel/clientes/segmentos" className="btn-ghost">
                Limpiar
              </a>
            </div>
          </form>
        </Card>

        {etiquetas.length > 0 && esDueno && (
          <Card title="Tus etiquetas" subtitle="Se ponen desde la ficha de cada cliente">
            <ul className="space-y-1">
              {etiquetas.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-1">
                  <Pastilla etiqueta={e} />
                  <span className="text-xs text-muted">
                    {e._count.links} {e._count.links === 1 ? "cliente" : "clientes"}
                  </span>
                  <FormSinSenal accion="borrarEtiquetaAction" servidor={borrarEtiquetaAction} className="ml-auto">
                    <input type="hidden" name="id" value={e.id} />
                    <SubmitButton
                      className="btn-ghost btn-sm px-2 text-subtle hover:text-bad"
                      pendingText="..."
                      ariaLabel={"Borrar etiqueta " + e.name}
                      confirm={"¿Borrar la etiqueta " + e.name + "? Se quita de todos los clientes."}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </SubmitButton>
                  </FormSinSenal>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Card
        className="min-w-0"
        title={total === 1 ? "1 cliente" : total + " clientes"}
        subtitle={
          conTelefono === destinatarios.length
            ? "Todos tienen WhatsApp"
            : conTelefono + " con teléfono para escribirles"
        }
      >
        {total === 0 ? (
          <Empty title="Nadie cumple esos filtros" hint="Quita alguno para ampliar el grupo." />
        ) : (
          <>
            {total > TOPE && (
              <p className="mb-3 text-xs text-subtle">
                Se muestran los primeros {TOPE}. Afina los filtros para llegar a los demás.
              </p>
            )}
            <MensajeSegmento destinatarios={destinatarios} negocio={user.businessName} />
          </>
        )}
      </Card>
    </div>
  );
}
