import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, todayIn } from "@/lib/dates";
import { pretty12h, prettyDay } from "@/lib/format";
import { buildSlots } from "@/lib/slots";
import { esManicuristaDeMbNails } from "@/lib/mb-nails";
import { queSePuedeMarcar } from "@/lib/novedades-cita";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { AccionesCita } from "@/components/AccionesCita";

export const dynamic = "force-dynamic";

/** Cuantos dias hacia adelante se ven las citas que le separaron. */
const DIAS_ADELANTE = 30;
/** Una cita de dias pasados que quedo sin marcar se sigue viendo una semana. */
const DIAS_ATRAS = 7;

/**
 * Lo unico que ve la manicurista de MB Nails (ver lib/mb-nails.ts): SUS
 * citas, con el nombre de la clienta, el dia, la hora y el servicio. Ni
 * telefonos, ni precios, ni plata, ni las citas de las demas. En cada una
 * marca Llegó, No llegó o Cambiar hora, y eso le llega a la dueña.
 */
export default async function MisCitasPage() {
  const { user, staff } = await requireSession({ manicuristaOk: true });
  if (!esManicuristaDeMbNails(user, staff)) redirect("/panel");

  const hoy = todayIn(user.timezone);
  const [porMarcar, llegaronHoy] = await Promise.all([
    db.appointment.findMany({
      where: {
        userId: user.id,
        staffId: staff.id,
        status: { in: ["PENDIENTE", "CONFIRMADO", "NO_ASISTIO"] },
        sale: null,
        day: { gte: addDays(hoy, -DIAS_ATRAS), lte: addDays(hoy, DIAS_ADELANTE) },
      },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
      select: { id: true, clientName: true, serviceName: true, day: true, startTime: true, endTime: true, status: true },
    }),
    db.appointment.findMany({
      where: { userId: user.id, staffId: staff.id, day: hoy, status: "ATENDIDO" },
      orderBy: { startTime: "asc" },
      select: { id: true, clientName: true, serviceName: true, startTime: true },
    }),
  ]);

  const horas = buildSlots(user);
  const sinMarcar = (s: string) => s === "PENDIENTE" || s === "CONFIRMADO";
  const porAtenderHoy = porMarcar.filter((a) => a.day === hoy && sinMarcar(a.status)).length;

  const porDia = new Map<string, typeof porMarcar>();
  for (const a of porMarcar) porDia.set(a.day, [...(porDia.get(a.day) ?? []), a]);
  const tituloDia = (d: string, citas: typeof porMarcar) =>
    d === hoy
      ? "Hoy"
      : d === addDays(hoy, 1)
        ? "Mañana"
        : d < hoy && citas.some((a) => sinMarcar(a.status))
          ? "Sin marcar · " + prettyDay(d)
          : prettyDay(d);

  return (
    <>
      <PageHeader title={"Hola, " + staff.name.split(" ")[0]} subtitle="Tus citas: marca si la clienta llegó, si no llegó o si cambió la hora" />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Por atender hoy" value={String(porAtenderHoy)} hint={porMarcar.length + " citas por delante"} tone="brand" />
        <Stat label="Llegaron hoy" value={String(llegaronHoy.length)} tone="good" />
      </div>

      <div className="mt-5 space-y-5">
        {porMarcar.length === 0 ? (
          <Card>
            <Empty title="No tienes citas por atender" hint="Cuando te asignen una, aparece aquí." />
          </Card>
        ) : (
          [...porDia.entries()].map(([dia, citas]) => (
            <section key={dia}>
              <h2 className={"mb-2 text-sm font-bold uppercase tracking-wide " + (dia < hoy ? "text-warn" : "text-muted")}>
                {tituloDia(dia, citas)}
              </h2>
              <ul className="space-y-3">
                {citas.map((a) => (
                  <li key={a.id} className="card-tight" data-cita={a.clientName}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-lg font-bold text-strong">
                          {pretty12h(a.startTime)} <span className="text-sm font-normal text-muted">a {pretty12h(a.endTime)}</span>
                        </p>
                        <p className="mt-0.5 text-base font-semibold text-strong">{a.clientName}</p>
                        <p className="text-sm text-body">{a.serviceName}</p>
                      </div>
                      {a.status === "NO_ASISTIO" && <Badge tone="amber">No llegó</Badge>}
                    </div>
                    <AccionesCita
                      cita={{ id: a.id, clientName: a.clientName, day: a.day, startTime: a.startTime, status: a.status }}
                      puede={queSePuedeMarcar(a, hoy)}
                      horas={horas}
                      hoy={hoy}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {llegaronHoy.length > 0 && (
          <Card title="Llegaron hoy" subtitle="Ya le avisamos a la dueña">
            <ul className="space-y-2">
              {llegaronHoy.map((a) => (
                <li key={a.id} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm" data-llego-hoy={a.clientName}>
                  <p className="font-semibold text-strong">
                    {pretty12h(a.startTime)} · {a.clientName}
                  </p>
                  <p className="text-xs text-muted">{a.serviceName}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
