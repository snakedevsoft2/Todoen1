import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayIn, timeIn, todayIn } from "@/lib/dates";
import { money, pretty12h, shortDay } from "@/lib/format";
import { toInternational, waLink } from "@/lib/whatsapp";
import { diasSinContacto, etapaDe, INTERACCIONES, primerNombre, type Etapa } from "@/lib/crm";
import { historialDe } from "@/lib/clientes";
import {
  filaDeSeguimiento,
  iniciales,
  INCLUIR_SEGUIMIENTO,
  opcionesDeClientes,
  personasDe,
  textoUltimoContacto,
} from "@/lib/crm-filas";
import { borrarClienteAction, borrarInteraccionAction, borrarOportunidadAction } from "@/actions/crm";
import { Badge, Card, Empty } from "@/components/ui";
import { EditarCliente } from "@/components/ClienteForm";
import { EtiquetasCliente, Pastilla } from "@/components/EtiquetasCliente";
import { InteraccionForm } from "@/components/InteraccionForm";
import { SeguimientoFila, SeguimientoForm } from "@/components/Seguimientos";
import { EditarOportunidad, OportunidadForm } from "@/components/OportunidadForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const ICONO_INTERACCION: Record<string, string> = {
  NOTA: "book",
  LLAMADA: "phone",
  WHATSAPP: "whatsapp",
  VISITA: "map",
  CORREO: "link",
  CHAT: "sparkle",
};

type Evento = {
  key: string;
  /** Para ordenar: "YYYY-MM-DD HH:mm". */
  orden: string;
  icon: string;
  titulo: string;
  detalle?: string;
  cuando: string;
  href?: string;
  borrar?: string;
};

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, staff } = await requireSession();
  const esDueno = staff.role === "DUENO";
  const hoy = todayIn(user.timezone);

  const cliente = await db.customer.findFirst({
    where: { id, userId: user.id },
    include: {
      tags: { select: { tagId: true } },
      deals: { orderBy: [{ closedAt: "asc" }, { updatedAt: "desc" }], include: { staff: { select: { name: true } } } },
      followUps: {
        orderBy: [{ doneAt: { sort: "desc", nulls: "first" } }, { dueDay: "asc" }],
        take: 40,
        include: INCLUIR_SEGUIMIENTO,
      },
      interactions: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!cliente) notFound();

  const [historial, etiquetas, personas, clientes] = await Promise.all([
    historialDe(user.id, cliente),
    db.customerTag.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    personasDe(user.id),
    opcionesDeClientes(user.id),
  ]);

  const telefono = cliente.phone ? toInternational(cliente.phone, user.whatsappNumber) : null;
  const whatsapp = telefono ? waLink(telefono, "Hola " + primerNombre(cliente.name) + ", ") : null;
  const dias = diasSinContacto(cliente.lastContactAt);
  const puestas = new Set(cliente.tags.map((t) => t.tagId));
  const ctx = { hoy, yoId: staff.id, esDueno, numeroNegocio: user.whatsappNumber };

  const eventos: Evento[] = [
    ...cliente.interactions.map((i) => {
      const dia = dayIn(i.createdAt, user.timezone);
      const hora = timeIn(i.createdAt, user.timezone);
      return {
        key: "i" + i.id,
        orden: dia + " " + hora,
        icon: ICONO_INTERACCION[i.kind] ?? "book",
        titulo: (INTERACCIONES.find((x) => x.key === i.kind)?.label ?? i.kind) + (i.staffName ? " · " + i.staffName : ""),
        detalle: i.text,
        cuando: shortDay(dia) + " · " + pretty12h(hora),
        borrar: esDueno ? i.id : undefined,
      };
    }),
    ...historial.citas.map((c) => ({
      key: "c" + c.id,
      orden: c.day + " " + c.startTime,
      icon: "calendar",
      titulo: "Turno · " + c.serviceName,
      detalle: c.status === "CANCELADO" ? "Cancelado" : c.status === "ATENDIDO" ? "Atendido" : undefined,
      cuando: shortDay(c.day) + " · " + pretty12h(c.startTime),
    })),
    ...historial.ventas.map((v) => ({
      key: "v" + v.id,
      orden: v.day + " 00:00",
      icon: "receipt",
      titulo: "Compra · " + money(v.total, user.currency),
      cuando: shortDay(v.day),
    })),
    ...historial.deudas.map((d) => ({
      key: "d" + d.id,
      orden: d.day + " 00:00",
      icon: "handshake",
      titulo: "Cartera · " + d.concept,
      detalle:
        d.status === "PENDIENTE"
          ? "Debe " + money(d.saldo, user.currency) + " de " + money(d.amount, user.currency)
          : d.status === "PAGADA"
            ? "Pagada"
            : "Anulada",
      cuando: shortDay(d.day),
      href: "/panel/cartera/" + d.id,
    })),
    ...historial.reportes.map((r) => ({
      key: "r" + r.id,
      orden: r.day + " 00:00",
      icon: "image",
      titulo: "Reporte · " + r.title,
      cuando: shortDay(r.day),
      href: "/panel/informes/" + r.id,
    })),
  ].sort((a, b) => (a.orden < b.orden ? 1 : a.orden > b.orden ? -1 : 0));

  const pendientes = cliente.followUps.filter((f) => !f.doneAt);
  const hechos = cliente.followUps.filter((f) => f.doneAt).slice(0, 5);

  return (
    <>
      <Link href="/panel/clientes" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-strong">
        <span aria-hidden>‹</span> Todos los clientes
      </Link>

      <section className="card">
        <div className="flex flex-wrap items-start gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white"
            aria-hidden
          >
            {iniciales(cliente.name)}
          </span>
          <div className="min-w-0 flex-1 basis-60">
            <h2 className="font-display text-xl leading-tight text-strong [overflow-wrap:anywhere]">{cliente.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {textoUltimoContacto(dias)}
              {" · "}
              Cliente desde {shortDay(dayIn(cliente.createdAt, user.timezone))}
            </p>
            {puestas.size > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {etiquetas
                  .filter((e) => puestas.has(e.id))
                  .map((e) => (
                    <Pastilla key={e.id} etiqueta={e} />
                  ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-success btn-sm">
                <Icon name="whatsapp" className="h-4 w-4" />
                WhatsApp
              </a>
            )}
            {cliente.phone && (
              <a href={"tel:" + cliente.phone.replace(/[^\d+]/g, "")} className="btn-ghost btn-sm">
                <Icon name="phone" className="h-4 w-4" />
                Llamar
              </a>
            )}
          </div>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
          <Dato label="Teléfono" valor={cliente.phone} />
          <Dato label="Correo" valor={cliente.email} />
          <Dato label="Cédula o NIT" valor={cliente.document} />
          <Dato label="Dirección" valor={cliente.address} />
          {cliente.notes && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-subtle">Notas</dt>
              <dd className="whitespace-pre-line text-body [overflow-wrap:anywhere]">{cliente.notes}</dd>
            </div>
          )}
        </dl>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Compras" valor={money(historial.totalComprado, user.currency)} />
          <Mini
            label="Debe"
            valor={money(historial.saldoPendiente, user.currency)}
            tono={historial.saldoPendiente > 0 ? "text-bad" : undefined}
          />
          <Mini label="Turnos" valor={String(historial.citas.length)} />
          <Mini label="Ventas abiertas" valor={String(cliente.deals.filter((d) => !d.closedAt).length)} />
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-line pt-3">
          <EditarCliente
            cliente={{
              id: cliente.id,
              name: cliente.name,
              phone: cliente.phone,
              email: cliente.email,
              document: cliente.document,
              address: cliente.address,
              notes: cliente.notes,
            }}
          />
          {esDueno && (
            <form action={borrarClienteAction} className="ml-auto">
              <input type="hidden" name="id" value={cliente.id} />
              <SubmitButton
                className="btn-ghost btn-sm text-bad"
                pendingText="Borrando..."
                confirm={
                  "¿Borrar la ficha de " +
                  cliente.name +
                  "? Se borran sus notas, seguimientos y oportunidades. Sus ventas, turnos y deudas no se tocan."
                }
              >
                <Icon name="trash" className="h-4 w-4" />
                Borrar ficha
              </SubmitButton>
            </form>
          )}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <Card title="Anotar algo" subtitle="Cada llamada o WhatsApp cuenta como contacto; las notas no.">
            <InteraccionForm customerId={cliente.id} />
          </Card>

          <Card title="Historial" subtitle="Lo anotado aquí más lo que tiene en turnos, ventas, cartera y reportes">
            {eventos.length === 0 ? (
              <Empty title="Todavía no hay nada" hint="Lo que anotes y lo que compre va apareciendo aquí." />
            ) : (
              <ol className="relative ml-3 border-l border-line">
                {eventos.map((e) => (
                  <li key={e.key} className="relative pb-4 pl-6 last:pb-0">
                    <span className="absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-panel text-muted">
                      <Icon name={e.icon} className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-strong [overflow-wrap:anywhere]">
                          {e.href ? (
                            <Link href={e.href} className="hover:underline">
                              {e.titulo}
                            </Link>
                          ) : (
                            e.titulo
                          )}
                        </p>
                        {e.detalle && (
                          <p className="mt-0.5 whitespace-pre-line text-sm text-body [overflow-wrap:anywhere]">{e.detalle}</p>
                        )}
                        <p className="mt-0.5 text-xs text-subtle">{e.cuando}</p>
                      </div>
                      {e.borrar && (
                        <form action={borrarInteraccionAction}>
                          <input type="hidden" name="id" value={e.borrar} />
                          <SubmitButton
                            className="btn-ghost btn-sm px-2 text-subtle hover:text-bad"
                            pendingText="..."
                            ariaLabel="Borrar esta anotación"
                            confirm="¿Borrar esta anotación?"
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card title="Seguimientos">
            {pendientes.length > 0 || hechos.length > 0 ? (
              <ul className="mb-4">
                {[...pendientes, ...hechos].map((s) => (
                  <SeguimientoFila key={s.id} s={filaDeSeguimiento(s, ctx)} conCliente={false} />
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-muted">Nada pendiente con este cliente.</p>
            )}
            <details className="group">
              <summary className="btn-ghost btn-sm cursor-pointer list-none">
                <Icon name="plus" className="h-4 w-4" />
                Agendar seguimiento
              </summary>
              <div className="mt-3">
                <SeguimientoForm hoy={hoy} yoId={staff.id} personas={personas} customerId={cliente.id} />
              </div>
            </details>
          </Card>

          <Card title="Oportunidades">
            {cliente.deals.length > 0 ? (
              <ul className="mb-4 space-y-2">
                {cliente.deals.map((d) => {
                  const etapa = etapaDe(d.stage);
                  return (
                    <li key={d.id} className="rounded-xl border border-line bg-surface p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-strong [overflow-wrap:anywhere]">{d.title}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {d.staff?.name ?? "Sin asignar"}
                            {d.expectedDay ? " · cierra " + shortDay(d.expectedDay) : ""}
                            {d.lostReason ? " · " + d.lostReason : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge tone={etapa.tono}>{etapa.label}</Badge>
                          <p className="mt-1 font-display text-sm text-strong num">{money(d.value, user.currency)}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-start gap-2">
                        <EditarOportunidad
                          currency={user.currency}
                          yoId={staff.id}
                          personas={personas}
                          deal={{
                            id: d.id,
                            title: d.title,
                            value: d.value,
                            stage: d.stage as Etapa,
                            staffId: d.staffId,
                            expectedDay: d.expectedDay,
                            lostReason: d.lostReason,
                          }}
                        />
                        {esDueno && (
                          <form action={borrarOportunidadAction}>
                            <input type="hidden" name="id" value={d.id} />
                            <SubmitButton
                              className="btn-ghost btn-sm px-2 text-subtle hover:text-bad"
                              pendingText="..."
                              ariaLabel="Borrar oportunidad"
                              confirm={"¿Borrar la oportunidad " + d.title + "?"}
                            >
                              <Icon name="trash" className="h-4 w-4" />
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-muted">Sin oportunidades de venta todavía.</p>
            )}
            <details>
              <summary className="btn-ghost btn-sm cursor-pointer list-none">
                <Icon name="plus" className="h-4 w-4" />
                Nueva oportunidad
              </summary>
              <div className="mt-3">
                <OportunidadForm
                  currency={user.currency}
                  yoId={staff.id}
                  personas={personas}
                  clientes={clientes}
                  customerId={cliente.id}
                  submitLabel="Agregar oportunidad"
                />
              </div>
            </details>
          </Card>

          <Card title="Etiquetas" subtitle="Toca una para ponerla o quitarla">
            <EtiquetasCliente customerId={cliente.id} todas={etiquetas} puestas={[...puestas]} />
          </Card>
        </div>
      </div>
    </>
  );
}

function Dato({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className={"[overflow-wrap:anywhere] " + (valor ? "text-body" : "text-subtle")}>{valor || "—"}</dd>
    </div>
  );
}

function Mini({ label, valor, tono }: { label: string; valor: string; tono?: string }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
      <p className={"mt-1 font-display text-base num " + (tono ?? "text-strong")}>{valor}</p>
    </div>
  );
}
