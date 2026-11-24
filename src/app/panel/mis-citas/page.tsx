import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, timeIn, todayIn } from "@/lib/dates";
import { cerosPara, money, pretty12h, prettyDay } from "@/lib/format";
import { buildSlots, workDaysArray } from "@/lib/slots";
import { waLink } from "@/lib/whatsapp";
import { esManicuristaDeMbNails } from "@/lib/mb-nails";
import { ordenDeCategorias } from "@/lib/categorias-negocio";
import { CATEGORIA_GENERAL } from "@/lib/categorias";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { AccionesCita, type ProductoLista } from "@/components/AccionesCita";
import { AgendarCita } from "@/components/AgendarCita";

export const dynamic = "force-dynamic";

/** Cuantos dias hacia adelante se ven las citas que le separaron. */
const DIAS_ADELANTE = 30;
/** Una cita de dias pasados que quedo sin cerrar se sigue viendo una semana. */
const DIAS_ATRAS = 7;

/**
 * Lo unico que ve la manicurista de MB Nails (ver lib/mb-nails.ts): las citas
 * que le separaron, cada una con dos botones -Cerrada y Reprogramada- y lo
 * que cerro hoy. Nada del negocio completo: el menu fijo lo resuelve
 * requireSession.
 */
export default async function MisCitasPage({
  searchParams,
}: {
  /** Desde Clientas: ?agendar=1&nombre=...&tel=... abre Agendar cita ya lleno. */
  searchParams: Promise<{ agendar?: string; nombre?: string; tel?: string }>;
}) {
  const { user, staff } = await requireSession({ manicuristaOk: true });
  const params = await searchParams;
  if (!esManicuristaDeMbNails(user, staff)) redirect("/panel");

  const hoy = todayIn(user.timezone);
  const [porAtender, cerradasHoy, productos, orden, suyas] = await Promise.all([
    db.appointment.findMany({
      where: {
        userId: user.id,
        staffId: staff.id,
        status: { in: ["PENDIENTE", "CONFIRMADO", "NO_ASISTIO"] },
        sale: null,
        day: { gte: addDays(hoy, -DIAS_ATRAS), lte: addDays(hoy, DIAS_ADELANTE) },
      },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
    }),
    db.appointment.findMany({
      where: { userId: user.id, staffId: staff.id, day: hoy, status: "ATENDIDO" },
      orderBy: { startTime: "asc" },
      include: { sale: { select: { total: true, items: { select: { name: true, qty: true } } } } },
    }),
    db.service.findMany({
      where: { userId: user.id, active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, price: true, category: true, bookable: true },
    }),
    ordenDeCategorias(user.id),
    // Sus horas ocupadas, para Agendar cita.
    db.appointment.findMany({
      where: { userId: user.id, staffId: staff.id, status: { not: "CANCELADO" }, day: { gte: hoy, lte: addDays(hoy, 90) } },
      select: { day: true, startTime: true },
    }),
  ]);

  // La lista de precios en el orden de la dueña; "General" de ultima.
  const posicion = (c: string) => (c === CATEGORIA_GENERAL ? Number.MAX_SAFE_INTEGER : orden.indexOf(c) === -1 ? orden.length : orden.indexOf(c));
  const lista: ProductoLista[] = [...productos]
    .sort((a, b) => posicion(a.category) - posicion(b.category))
    .map(({ id, name, price, category }) => ({ id, name, price, category }));
  // Para agendar, solo lo que se reserva (los servicios, no el mecato).
  const servicios = lista.filter((p) => productos.find((x) => x.id === p.id)?.bookable);
  const horas = buildSlots(user);
  const ceros = cerosPara(user.businessType);

  const pendientesHoy = porAtender.filter((a) => a.day === hoy).length;
  const cobradoHoy = cerradasHoy.reduce((s, a) => s + (a.sale?.total ?? 0), 0);

  const porDia = new Map<string, typeof porAtender>();
  for (const a of porAtender) porDia.set(a.day, [...(porDia.get(a.day) ?? []), a]);
  const tituloDia = (d: string) =>
    d === hoy ? "Hoy" : d === addDays(hoy, 1) ? "Mañana" : d < hoy ? "Sin cerrar · " + prettyDay(d) : prettyDay(d);

  return (
    <>
      <PageHeader title={"Hola, " + staff.name.split(" ")[0]} subtitle="Agenda citas, vende un servicio o un producto, y cierra o reprograma tus citas" />

      <AgendarCita
        servicios={servicios}
        horas={horas}
        hoy={hoy}
        ahora={timeIn(new Date(), user.timezone)}
        ocupadas={suyas.map((a) => a.day + " " + a.startTime)}
        diasQueSeAtiende={workDaysArray(user.workDays)}
        currency={user.currency}
        inicial={params.agendar ? { nombre: (params.nombre ?? "").slice(0, 80), telefono: (params.tel ?? "").slice(0, 40) } : null}
        alLado={
          <Link href="/panel/mecato" className="btn-success w-full justify-center py-3 text-base" data-boton-vender>
            <Icon name="receipt" className="h-5 w-5 shrink-0" />
            Vender
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Por atender hoy" value={String(pendientesHoy)} hint={porAtender.length + " en total"} tone="brand" />
        <Stat label="Cerradas hoy" value={money(cobradoHoy, user.currency)} hint={cerradasHoy.length + " citas"} tone="good" />
      </div>

      <div className="mt-5 space-y-5">
        {porAtender.length === 0 ? (
          <Card>
            <Empty title="No tienes citas por atender" hint="Agenda una arriba, o cuando te separen una aparece aquí." />
          </Card>
        ) : (
          [...porDia.entries()].map(([dia, citas]) => (
            <section key={dia}>
              <h2 className={"mb-2 text-sm font-bold uppercase tracking-wide " + (dia < hoy ? "text-warn" : "text-muted")}>{tituloDia(dia)}</h2>
              <ul className="space-y-3">
                {citas.map((a) => {
                  const wa = waLink(a.clientPhone, "Hola " + a.clientName + ", te escribo de MB Nails Spa por tu cita.");
                  return (
                    <li key={a.id} className="card-tight" data-cita={a.clientName}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-lg font-bold text-strong">
                            {pretty12h(a.startTime)} <span className="text-sm font-normal text-muted">a {pretty12h(a.endTime)}</span>
                          </p>
                          <p className="mt-0.5 text-base font-semibold text-strong">{a.clientName}</p>
                          <p className="text-sm text-body">
                            {a.serviceName} · {money(a.price, user.currency)}
                          </p>
                          {a.notes && <p className="mt-1 text-xs text-muted">{a.notes}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          {a.status === "NO_ASISTIO" && <Badge tone="amber">No vino</Badge>}
                          {wa && (
                            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                              <Icon name="whatsapp" className="h-4 w-4" />
                              WhatsApp
                            </a>
                          )}
                        </div>
                      </div>
                      <AccionesCita
                        cita={{ id: a.id, serviceName: a.serviceName, price: a.price, day: a.day, startTime: a.startTime }}
                        lista={lista}
                        horas={horas}
                        hoy={hoy}
                        currency={user.currency}
                        ceros={ceros}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}

        {cerradasHoy.length > 0 && (
          <Card title="Cerradas hoy" subtitle="Ya quedaron como venta a tu nombre">
            <ul className="space-y-2">
              {cerradasHoy.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm" data-cerrada={a.clientName}>
                  <div className="min-w-0">
                    <p className="font-semibold text-strong">
                      {pretty12h(a.startTime)} · {a.clientName}
                    </p>
                    <p className="text-xs text-muted">{a.sale?.items.map((i) => (i.qty > 1 ? i.qty + "x " : "") + i.name).join(" + ") ?? a.serviceName}</p>
                  </div>
                  <span className="shrink-0 font-bold text-good">{money(a.sale?.total ?? a.price, user.currency)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
