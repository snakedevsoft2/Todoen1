import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayIn, timeIn } from "@/lib/dates";
import { pretty12h, shortDay } from "@/lib/format";
import { toInternational, waLink } from "@/lib/whatsapp";
import { ESTADOS_MENSAJE, aplicarPlantilla } from "@/lib/crm";
import { canalesDe } from "@/lib/envios-crm";
import { cancelarMensajeAction } from "@/actions/mensajes";
import { Badge, Card, Empty } from "@/components/ui";
import { EnviarAMano } from "@/components/ProgramarMensaje";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

/**
 * Los mensajes a los clientes: los que hay que mandar a mano, los programados
 * y lo que ya salio.
 */
export default async function MensajesPage() {
  const { user, staff } = await requireSession();
  // Cancelar un mensaje programado es del dueño.
  const esDueno = staff.role === "DUENO";
  const canales = canalesDe(user);
  const cuando = (d: Date) => shortDay(dayIn(d, user.timezone)) + " · " + pretty12h(timeIn(d, user.timezone));
  const incluir = { customer: { select: { id: true, name: true, phone: true } } } as const;

  const [aMano, programados, historial] = await Promise.all([
    db.scheduledMessage.findMany({ where: { userId: user.id, status: "MANUAL" }, orderBy: { sendAt: "asc" }, take: 100, include: incluir }),
    db.scheduledMessage.findMany({
      where: { userId: user.id, status: { in: ["PENDIENTE", "ENVIANDO"] } },
      orderBy: { sendAt: "asc" },
      take: 100,
      include: incluir,
    }),
    db.scheduledMessage.findMany({
      where: { userId: user.id, status: { in: ["ENVIADO", "FALLIDO", "CANCELADO"] } },
      orderBy: { updatedAt: "desc" },
      take: 40,
      include: incluir,
    }),
  ]);

  const Canal = ({ ok, label, hint }: { ok: boolean; label: string; hint: string }) => (
    <li className="flex items-start gap-2.5">
      <span className={"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full " + (ok ? "bg-good text-white" : "bg-surface text-muted")}>
        {ok ? <Icon name="check" className="h-3 w-3" /> : <Icon name="x" className="h-3 w-3" />}
      </span>
      <span>
        <span className="block text-sm font-semibold text-strong">{label}</span>
        <span className="block text-[12px] text-muted">{hint}</span>
      </span>
    </li>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-4">
        <Card title="Para enviar a mano" subtitle="No había envío automático para estos: tócalos y salen por WhatsApp">
          {aMano.length === 0 ? (
            <p className="text-sm text-muted">Nada pendiente por enviar a mano.</p>
          ) : (
            <ul className="divide-y divide-line" data-mensajes-a-mano>
              {aMano.map((m) => {
                const tel = m.customer.phone ? toInternational(m.customer.phone, user.whatsappNumber) : null;
                const href = tel ? waLink(tel, aplicarPlantilla(m.text, { nombre: m.customer.name, negocio: user.businessName })) : null;
                return (
                  <li key={m.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <Link href={"/panel/clientes/" + m.customer.id} className="block truncate text-sm font-semibold text-strong hover:underline">
                        {m.customer.name}
                      </Link>
                      <span className="block truncate text-[12px] text-muted">{aplicarPlantilla(m.text, { nombre: m.customer.name, negocio: user.businessName })}</span>
                    </span>
                    {href && <EnviarAMano id={m.id} href={href} />}
                    {esDueno && (
                    <form action={cancelarMensajeAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <SubmitButton className="btn-ghost btn-sm px-2 text-subtle" pendingText="..." ariaLabel="Cancelar mensaje">
                        <Icon name="x" className="h-4 w-4" />
                      </SubmitButton>
                    </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Programados" subtitle="Salen solos a su hora">
          {programados.length === 0 ? (
            <Empty title="No hay mensajes programados" hint="Prográmalos desde la ficha de un cliente o para todo un segmento." />
          ) : (
            <ul className="divide-y divide-line" data-mensajes-programados>
              {programados.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <Link href={"/panel/clientes/" + m.customer.id} className="block truncate text-sm font-semibold text-strong hover:underline">
                      {m.customer.name}
                    </Link>
                    <span className="block truncate text-[12px] text-muted">
                      {cuando(m.sendAt)} · {m.text}
                    </span>
                  </span>
                  <Badge tone={ESTADOS_MENSAJE[m.status].tone}>{ESTADOS_MENSAJE[m.status].label}</Badge>
                  {esDueno && m.status === "PENDIENTE" && (
                    <form action={cancelarMensajeAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <SubmitButton className="btn-ghost btn-sm" pendingText="...">
                        Cancelar
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Lo último que salió">
          {historial.length === 0 ? (
            <p className="text-sm text-muted">Todavía no ha salido ningún mensaje.</p>
          ) : (
            <ul className="divide-y divide-line">
              {historial.map((m) => (
                <li key={m.id} className="flex items-start gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-strong">{m.customer.name}</span>
                    <span className="block text-[12px] text-muted [overflow-wrap:anywhere]">
                      {cuando(m.sentAt ?? m.updatedAt)}
                      {m.via ? " · por " + (m.via === "correo" ? "correo" : m.via === "enlace" ? "WhatsApp a mano" : "WhatsApp") : ""}
                      {m.status === "FALLIDO" && m.detail ? " · " + m.detail : ""}
                    </span>
                  </span>
                  <Badge tone={ESTADOS_MENSAJE[m.status].tone}>{ESTADOS_MENSAJE[m.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="min-w-0">
        <Card title="Envío automático" subtitle="Por dónde pueden salir solos">
          <ul className="space-y-3">
            <Canal
              ok={canales.whatsapp}
              label="WhatsApp (API de Meta)"
              hint={canales.whatsapp ? "Conectado." : "Conéctalo en Personalizar, en Avisos por WhatsApp, eligiendo Meta."}
            />
            <Canal
              ok={canales.plantilla}
              label="Plantilla aprobada de Meta"
              hint={
                canales.plantilla
                  ? "Lista: puedes escribirle primero a cualquier cliente."
                  : "Sin plantilla, WhatsApp solo sale a quien te escribió en las últimas 24 horas. Créala en Meta con {{1}} nombre y {{2}} mensaje."
              }
            />
            <Canal ok={canales.correo} label="Correo" hint={canales.correo ? "Conectado: sale a los clientes que tienen correo." : "Falta configurar el correo en el servidor (SMTP_USER y SMTP_PASS)."} />
          </ul>
          <p className="mt-4 text-[12px] text-muted">
            Lo que no pueda salir solo queda arriba, en «Para enviar a mano», con el mensaje ya escrito.
          </p>
          <Link href="/panel/personalizar" className="btn-ghost btn-sm mt-3">
            <Icon name="cog" className="h-4 w-4" />
            Configurar WhatsApp
          </Link>
        </Card>
      </div>
    </div>
  );
}
