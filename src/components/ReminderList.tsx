import Link from "next/link";
import { markReminderSentAction, undoReminderSentAction } from "@/actions/reminders";
import { pretty12h, prettyDay } from "@/lib/format";
import { reminderMessage, toInternational, waLink } from "@/lib/whatsapp";
import { Card, Empty } from "./ui";
import { SubmitButton } from "./SubmitButton";
import { Icon } from "./Icon";

export type ReminderRow = {
  id: string;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  day: string;
  startTime: string;
  staffName: string | null;
  reminderSentAt: Date | null;
};

/**
 * Recordatorios de los turnos de manana.
 *
 * Cada uno abre WhatsApp con el mensaje ya escrito, asi que funciona sin
 * configurar nada. Si el negocio tiene CallMeBot o Meta puestos, la tarea
 * automatica los manda sola de madrugada y esta lista amanece vacia.
 */
export function ReminderList({
  rows,
  businessName,
  address,
  ownerNumber,
  autoOn,
}: {
  rows: ReminderRow[];
  businessName: string;
  address: string | null;
  /** Numero del negocio, para completar el indicativo del cliente. */
  ownerNumber: string | null;
  /** true si el envio automatico esta configurado. */
  autoOn: boolean;
}) {
  const pendientes = rows.filter((r) => !r.reminderSentAt);
  const enviados = rows.filter((r) => r.reminderSentAt);

  return (
    <Card
      title="Recordatorios de manana"
      subtitle={
        autoOn
          ? "Se mandan solos de madrugada. Aqui puedes adelantarte."
          : "Un toque y se abre WhatsApp con el mensaje escrito"
      }
    >
      {rows.length === 0 ? (
        <Empty
          title="No hay recordatorios por mandar"
          hint="Solo salen los turnos de manana de los clientes que pidieron que les recordaran."
        />
      ) : (
        <ul className="space-y-2">
          {[...pendientes, ...enviados].map((row) => {
            const enviado = Boolean(row.reminderSentAt);
            const enlace = waLink(
              toInternational(row.clientPhone, ownerNumber),
              reminderMessage({
                businessName,
                clientName: row.clientName,
                prettyDay: prettyDay(row.day),
                time: pretty12h(row.startTime),
                serviceName: row.serviceName,
                staffName: row.staffName,
                address,
              })
            );

            return (
              <li
                key={row.id}
                className={
                  "flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 " +
                  (enviado ? "border-line bg-surface opacity-70" : "border-edge bg-panel")
                }
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-strong">
                    {pretty12h(row.startTime)} - {row.clientName}
                  </p>
                  <p className="text-xs text-muted">
                    {row.serviceName}
                    {row.staffName ? " - " + row.staffName : ""} - {row.clientPhone}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {enviado ? (
                    <>
                      <span className="text-xs font-bold text-good">
                        <Icon name="check" className="mr-1 inline h-3.5 w-3.5" />
                        Enviado
                      </span>
                      <form action={undoReminderSentAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <SubmitButton className="btn-ghost btn-sm" pendingText="...">
                          Deshacer
                        </SubmitButton>
                      </form>
                    </>
                  ) : (
                    <>
                      {enlace ? (
                        <Link
                          href={enlace}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-success btn-sm"
                        >
                          <Icon name="whatsapp" className="h-4 w-4" />
                          Recordar
                        </Link>
                      ) : (
                        <span className="text-xs text-subtle">Telefono invalido</span>
                      )}
                      <form action={markReminderSentAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <SubmitButton className="btn-ghost btn-sm" pendingText="...">
                          Ya lo mande
                        </SubmitButton>
                      </form>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
