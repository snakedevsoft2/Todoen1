import Link from "next/link";
import { headers } from "next/headers";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayIn, timeIn } from "@/lib/dates";
import { pretty12h, shortDay } from "@/lib/format";
import { aiEnabled } from "@/lib/ai";
import { configDe, saludoDe, tieneAgenda } from "@/lib/agente";
import { MAX_POR_NEGOCIO_DIA } from "@/lib/agente-reglas";
import { Alert, Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { AgenteForm } from "@/components/AgenteForm";
import { ChatAgente } from "@/components/ChatAgente";
import { DiagnosticoIa } from "@/components/DiagnosticoIa";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const CANAL: Record<string, { label: string; tone: "green" | "blue" | "slate" }> = {
  whatsapp: { label: "WhatsApp", tone: "green" },
  web: { label: "Página", tone: "blue" },
  prueba: { label: "Prueba", tone: "slate" },
};

const DIA = 86_400_000;

export default async function AgentePage() {
  const { user } = await requireOwner();
  const conClave = aiEnabled();
  const config = await configDe(user.id);
  const metaConectado = user.whatsappProvider === "meta" && Boolean(user.whatsappApiKey && user.whatsappPhoneId);
  const agenda = tieneAgenda(user);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "tu-app.vercel.app";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const webhook = protocolo + "://" + host + "/api/whatsapp/webhook";

  const hace24 = new Date(Date.now() - DIA);
  const [conversaciones, respondidas, acciones, hoy] = await Promise.all([
    db.agentConversation.findMany({
      where: { userId: user.id },
      orderBy: { lastMessageAt: "desc" },
      take: 30,
      include: {
        customer: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 16 },
      },
    }),
    db.agentMessage.count({ where: { userId: user.id, role: "agente", createdAt: { gte: hace24 } } }),
    db.agentMessage.count({
      where: {
        userId: user.id,
        action: { not: null },
        conversation: { channel: { not: "prueba" } },
        createdAt: { gte: new Date(Date.now() - 7 * DIA) },
      },
    }),
    db.agentConversation.count({
      where: { userId: user.id, channel: { not: "prueba" }, lastMessageAt: { gte: hace24 } },
    }),
  ]);
  const uso = Math.min(100, Math.round((respondidas / MAX_POR_NEGOCIO_DIA) * 100));

  return (
    <>
      <PageHeader
        title="Agente IA"
        subtitle={
          agenda
            ? "Responde solo a tus clientes y les separa el turno, en tu página y en tu WhatsApp"
            : "Responde solo a tus clientes y les toma el pedido, en tu página y en tu WhatsApp"
        }
      >
        {config.webOn && (
          <Link href={"/catalogo/" + user.slug} target="_blank" className="btn-ghost btn-sm">
            <Icon name="link" className="h-4 w-4" />
            Ver en mi página
          </Link>
        )}
      </PageHeader>

      {!conClave && (
        <div className="mb-4">
          <Alert kind="info">
            Falta conectar el modelo de IA. En Vercel agrega la variable GEMINI_API_KEY con una clave gratuita de
            Google AI Studio (aistudio.google.com, botón «Get API key») y vuelve a desplegar.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Conversaciones hoy" value={String(hoy)} hint="Página y WhatsApp" />
        <Stat label="Respuestas en 24 h" value={String(respondidas)} hint={"Tope diario: " + MAX_POR_NEGOCIO_DIA} />
        <Stat
          label={agenda ? "Turnos y recados" : "Pedidos y recados"}
          value={String(acciones)}
          hint="Últimos 7 días"
          tone="good"
        />
        <div className="card-tight">
          <p className="eyebrow">Uso del día</p>
          <p className="mt-2.5 stat-value text-strong">{uso}%</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
            <div
              className={"h-full rounded-full transition-all duration-500 " + (uso > 80 ? "bg-bad" : "bg-good")}
              style={{ width: uso + "%" }}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-4">
          <Card title="Cómo responde">
            <AgenteForm
              inicial={config}
              saludoPorDefecto={saludoDe(user, { greeting: null })}
              metaConectado={metaConectado}
              agenda={agenda}
            />
          </Card>

          <Card title="Conversaciones" subtitle="Lo que el agente les ha dicho a tus clientes">
            {conversaciones.length === 0 ? (
              <Empty
                title="Todavía nadie le ha escrito"
                hint="Cuando un cliente use el chat o te escriba al WhatsApp, la conversación aparece aquí."
              />
            ) : (
              <ul className="space-y-2">
                {conversaciones.map((c) => {
                  const msgs = [...c.messages].reverse();
                  const ultimo = c.messages[0];
                  const hechas = msgs.filter((m) => m.action).map((m) => m.action as string);
                  const canal = CANAL[c.channel] ?? CANAL.web;
                  const nombre =
                    c.customer?.name ?? c.contactName ?? (c.channel === "whatsapp" ? "+" + c.contactKey : "Visitante de la página");
                  return (
                    <li key={c.id} data-conversacion={c.id}>
                      <details className="group rounded-xl border border-line bg-surface">
                        <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-strong">{nombre}</span>
                              <Badge tone={canal.tone}>{canal.label}</Badge>
                              {hechas.length > 0 && <Badge tone="amber">{hechas.length === 1 ? "1 acción" : hechas.length + " acciones"}</Badge>}
                            </span>
                            {ultimo && <span className="mt-0.5 block truncate text-xs text-muted">{ultimo.text}</span>}
                          </span>
                          <span className="shrink-0 text-[11px] text-subtle">
                            {shortDay(dayIn(c.lastMessageAt, user.timezone))} · {pretty12h(timeIn(c.lastMessageAt, user.timezone))}
                          </span>
                        </summary>
                        <div className="space-y-2 border-t border-line px-3 py-3">
                          {msgs.map((m) => (
                            <div key={m.id} className={"flex " + (m.role === "cliente" ? "justify-start" : "justify-end")}>
                              <div className="max-w-[85%]">
                                <p
                                  className={
                                    "whitespace-pre-line rounded-2xl px-3 py-2 text-[13px] [overflow-wrap:anywhere] " +
                                    (m.role === "cliente" ? "rounded-bl-md bg-panel text-strong" : "rounded-br-md bg-brand-600 text-white")
                                  }
                                >
                                  {m.text}
                                </p>
                                {m.action && (
                                  <p className="mt-1 flex items-center justify-end gap-1 text-[11px] font-semibold text-good">
                                    <Icon name="check" className="h-3 w-3" />
                                    {m.action}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                          {c.customer && (
                            <Link href={"/panel/clientes/" + c.customer.id} className="btn-ghost btn-sm mt-1">
                              <Icon name="users" className="h-4 w-4" />
                              Ver ficha del cliente
                            </Link>
                          )}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card title="Pruébalo" subtitle="Escríbele como si fueras un cliente. En la prueba no se guardan turnos ni pedidos.">
            {conClave ? (
              <ChatAgente
                endpoint="/api/agente/prueba"
                negocio={user.businessName}
                saludo={saludoDe(user, config)}
                almacen={"prueba_" + user.id}
                flotante={false}
              />
            ) : (
              <p className="text-sm text-muted">Disponible cuando se conecte el modelo de IA.</p>
            )}
          </Card>

          <Card title="¿No responde?" subtitle="Prueba la conexión con Gemini y te decimos exactamente qué falla">
            <DiagnosticoIa />
          </Card>

          <Card title="Conectar WhatsApp" subtitle="Solo una vez. Necesitas la API oficial de WhatsApp Business de Meta.">
            <ol className="space-y-3 text-sm text-body">
              <Paso hecho={metaConectado} n={1}>
                En <Link href="/panel/personalizar" className="font-semibold underline">Personalizar</Link>, en
                Avisos por WhatsApp, elige Meta y pega el token y el identificador del número.
              </Paso>
              <Paso hecho={Boolean(process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET)} n={2}>
                En Vercel agrega WHATSAPP_VERIFY_TOKEN (una palabra secreta que tú inventas) y WHATSAPP_APP_SECRET (la
                clave secreta de tu app en Meta).
              </Paso>
              <Paso n={3}>
                En Meta for Developers, WhatsApp → Configuración → Webhook, pega esta dirección y la misma palabra
                secreta, y suscríbete a <strong>messages</strong>:
                <code className="mt-1.5 block break-all rounded-lg bg-surface px-2 py-1.5 text-[12px] text-strong">{webhook}</code>
              </Paso>
              <Paso n={4}>Prende «Contestar mi WhatsApp» y escríbete desde otro teléfono para probar.</Paso>
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function Paso({ n, hecho, children }: { n: number; hecho?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold " +
          (hecho ? "bg-good text-white" : "bg-surface text-muted")
        }
      >
        {hecho ? <Icon name="check" className="h-3.5 w-3.5" /> : n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}
